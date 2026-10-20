-- ============================================================
-- Cronograma — a marcação instantânea pelo Cowork (2026-10-13).
-- Idempotente: pode rodar de novo sem estragar nada.
-- ============================================================
--
-- O QUE ESTA FUNÇÃO FAZ, EM UMA FRASE. No fim de cada etapa do pipeline, o
-- Cowork chama, pelo conector do Supabase,
--
--     select public.cron_pipeline_marcar('pipeline/a01/a01-3');
--
-- e a etapa aparece concluída nos aparelhos no mesmo instante, pelo Realtime,
-- como se fosse mais um aparelho marcando.
--
-- POR QUE O CONECTOR. O Cowork roda atrás de um proxy que recusa o
-- api.github.com e o supabase.co (medido em 2026-10-13): nem o --registrar nem
-- um curl saem de lá. O conector do Supabase sai. E o desenho decidido pelo
-- autor é este: a marcação acontece quando ELE dispara a janela no Cowork, e
-- não numa rodada agendada.
--
-- POR QUE UMA FUNÇÃO, E NÃO UM UPDATE ESCRITO PELO COWORK. O conector tem acesso
-- total ao banco — que é compartilhado com o CONTAS_CASA. Um UPDATE redigido a
-- cada janela por um modelo é o tipo de coisa que funciona noventa e nove vezes.
-- Aqui as regras moram num lugar só, e o Cowork só diz QUAL etapa fechou:
--
--   · só etapa de prova "maquina" na estrutura publicada (cron_estrutura_base).
--     Prova "estrela" é decisão do autor: desde 2026-10-20, só o portão do
--     NotebookLM (até ali, também o Brainstorm e o "pronto para submeter");
--   · só etapa ATIVA. Adiar, abandonar, arquivar e "não se aplica" são decisões
--     do autor (2026-10-12), e etapa apagada não volta pela máquina;
--   · só CONCLUIR (st = 2). Voltar uma etapa, mudar a vida dela ou passar por
--     cima de uma recusa é coisa do aplicativo, na mão do autor;
--   · o valor é o de agora com o `st` novo: vida, motivo, data de volta e
--     vidaDesde ficam como estão — o banco troca o valor INTEIRO, e montar um
--     do zero apagaria o adiamento e o motivo;
--   · etapa já concluída não é reescrita: a resposta é "ja_estava";
--   · e cada marcação deixa uma linha no cron_registro, o histórico que o
--     aplicativo mostra.
--
-- O RELÓGIO. O gatilho cron_estado_relogio descarta em silêncio todo UPDATE cujo
-- `em` não seja estritamente mais novo. O `em` daqui é o relógio do servidor,
-- cortado no milissegundo como o dos aparelhos; se a linha tiver um `em` à
-- frente dele (aparelho com o relógio adiantado), este vale 1 ms depois do dela.
-- A linha está travada (FOR UPDATE) desde a leitura, então "depois do que eu li"
-- é também "depois de tudo o que já está no banco": a decisão foi tomada sobre
-- ela. Sem isso, o gatilho engoliria a marcação e a resposta diria que deu certo.
--
-- O QUE ELA DEVOLVE, sempre um objeto e nunca uma exceção por regra:
--
--   {"resultado": "marcada" | "ja_estava" | "recusada" | "marcaria",
--    "chave": ..., "projeto": ..., "etapa": ..., "de": ..., "para": 2,
--    "vida": ..., "mensagem": "o que aconteceu, em uma frase"}
--
-- "marcaria" é a resposta do p_seco (conferir sem escrever). Exceção só para
-- o inesperado — e então a transação inteira volta, sem marcação pela metade:
-- o item e a linha de registro entram juntos ou não entram.
--
-- QUEM CHAMA. O conector (papel postgres) e a service_role — o
-- dobrar_toques.py --registrar, que o botão de conferência do Actions usa. Nunca
-- o aplicativo: o EXECUTE sai de public, anon e authenticated. Os dois papéis
-- que chamam ignoram a RLS (bypassrls), e por isso a função é SECURITY INVOKER:
-- ela não empresta poder a ninguém.
create or replace function public.cron_pipeline_marcar(
  p_chave text,
  p_seco  boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_partes  text[];
  v_donos   bigint;
  v_dono    uuid;
  v_sub     jsonb;
  v_proj_t  text;
  v_linha   public.cron_estado%rowtype;
  v_existe  boolean;
  v_atual   jsonb;
  v_vida    text;
  v_st      int;
  v_de      int;
  v_novo    jsonb;
  v_em      timestamptz;
  v_n       int := 0;
  v_volta   int;
  v_campo   text;
  v_resp    jsonb;
begin
  -- 1. A CHAVE. painel/projeto/etapa, três partes sem barra nem espaço.
  if p_chave is null
     or p_chave !~ '^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$' then
    return jsonb_build_object(
      'resultado', 'recusada', 'chave', p_chave, 'para', 2,
      'mensagem', 'Chave inválida: use painel/projeto/etapa, por exemplo '
                  'pipeline/a01/a01-3. Nada foi escrito.');
  end if;
  v_partes := string_to_array(p_chave, '/');

  -- 2. O DONO vem da cron_dono, como no --registrar. Dois donos é ambiguidade,
  --    não um caso a resolver por escolha.
  select count(*) into v_donos from public.cron_dono;
  if v_donos <> 1 then
    return jsonb_build_object(
      'resultado', 'recusada', 'chave', p_chave, 'para', 2,
      'mensagem', format('O Cronograma tem %s dono(s) cadastrado(s), e eu esperava '
                         'exatamente 1. Nada foi escrito.', v_donos));
  end if;
  select uid into v_dono from public.cron_dono;

  -- 3. A ESTRUTURA PUBLICADA decide o que a máquina pode afirmar.
  select valor into v_sub
    from public.cron_estrutura_base
   where dono = v_dono and chave = p_chave and tipo = 'subitem';
  if not found then
    return jsonb_build_object(
      'resultado', 'recusada', 'chave', p_chave, 'para', 2,
      'mensagem', 'Esta etapa não está na estrutura publicada do Cronograma. '
                  'Confira o código (por exemplo pipeline/a01/a01-3). '
                  'Nada foi escrito.');
  end if;
  select valor->>'t' into v_proj_t
    from public.cron_estrutura_base
   where dono = v_dono and chave = v_partes[1] || '/' || v_partes[2]
     and tipo = 'projeto';

  v_resp := jsonb_build_object('chave', p_chave, 'projeto', v_proj_t,
                               'etapa', v_sub->>'t', 'para', 2);

  if coalesce(v_sub->>'prova', '') = 'estrela' then
    return v_resp || jsonb_build_object(
      'resultado', 'recusada',
      'mensagem', 'Prova estrela: a conclusão desta etapa é decisão do autor, '
                  'e não do artefato. Ele marca no aplicativo. Nada foi escrito.');
  end if;
  if coalesce(v_sub->>'prova', '') <> 'maquina' then
    return v_resp || jsonb_build_object(
      'resultado', 'recusada',
      'mensagem', 'A etapa não tem prova "maquina" na estrutura publicada, e a '
                  'máquina só marca etapa assim. Nada foi escrito.');
  end if;

  -- 4. O ESTADO DE AGORA, travado até o fim da transação. Duas voltas no
  --    máximo: a segunda só acontece quando a etapa nunca tocada ganhou a sua
  --    linha entre a leitura e o INSERT, e então é ela que se lê.
  for v_volta in 1..2 loop
    select * into v_linha
      from public.cron_estado
     where dono = v_dono and dominio = 'item' and chave = p_chave
       for update;
    v_existe := found;

    v_atual := case when v_existe then coalesce(v_linha.valor, '{}'::jsonb)
                    else '{}'::jsonb end;
    v_vida  := coalesce(nullif(v_atual->>'vida', ''), 'ativo');
    v_de    := case when v_atual->>'st' ~ '^[0-9]+$'
                    then (v_atual->>'st')::int end;
    v_st    := coalesce(v_de, 0);
    v_resp  := v_resp || jsonb_build_object('de', v_de, 'vida', v_vida);

    if v_existe and v_linha.del then
      return v_resp || jsonb_build_object(
        'resultado', 'recusada',
        'mensagem', 'A etapa foi apagada no aplicativo, e a máquina não a traz '
                    'de volta. Nada foi escrito.');
    end if;
    if v_vida <> 'ativo' then
      return v_resp || jsonb_build_object(
        'resultado', 'recusada',
        'mensagem', format('A etapa está com vida "%s" no aplicativo. Adiar, '
                           'abandonar, arquivar ou dizer que não se aplica é '
                           'decisão do autor, e a máquina só marca etapa ativa. '
                           'Nada foi escrito.', v_vida));
    end if;
    if v_st >= 2 then
      return v_resp || jsonb_build_object(
        'resultado', 'ja_estava',
        'mensagem', 'A etapa já estava concluída. Nada foi escrito.');
    end if;
    if p_seco then
      return v_resp || jsonb_build_object(
        'resultado', 'marcaria',
        'mensagem', 'Conferência: a etapa seria marcada como concluída. '
                    'Nada foi escrito.');
    end if;

    -- 5. O VALOR é o de agora com o `st` novo. Os campos que o aplicativo
    --    sempre escreve como texto existem sempre, como no --registrar.
    v_novo := v_atual || jsonb_build_object('st', 2, 'vida', v_vida);
    foreach v_campo in array array['motivo', 'voltar_em', 'vidaDesde'] loop
      if jsonb_typeof(v_novo->v_campo) is distinct from 'string' then
        v_novo := v_novo || jsonb_build_object(v_campo, '');
      end if;
    end loop;

    v_em := date_trunc('milliseconds', clock_timestamp());
    if v_existe and v_em <= v_linha.em then
      v_em := date_trunc('milliseconds', v_linha.em) + interval '1 millisecond';
    end if;

    if v_existe then
      update public.cron_estado
         set valor = v_novo, del = false, em = v_em, aparelho = 'cowork'
       where dono = v_dono and dominio = 'item' and chave = p_chave;
      get diagnostics v_n = row_count;
      exit;
    end if;

    insert into public.cron_estado (dono, dominio, chave, valor, del, em,
                                    aparelho, expira_em)
    values (v_dono, 'item', p_chave, v_novo, false, v_em, 'cowork', null)
    on conflict (dono, dominio, chave) do nothing;
    get diagnostics v_n = row_count;
    exit when v_n = 1;
  end loop;

  -- A LINHA ENTROU, OU NÃO HOUVE ESCRITA. Com a trava e o `em` acima, o gatilho
  -- do relógio não tem o que descartar; se um dia descartar, a resposta diz.
  if v_n <> 1 then
    return v_resp || jsonb_build_object(
      'resultado', 'recusada',
      'mensagem', 'A etapa mudou enquanto eu conferia, e o banco não aceitou a '
                  'escrita. Nada foi escrito: chame de novo.');
  end if;

  -- 6. O REGISTRO, na mesma transação. O id segue o dos aparelhos (instante +
  --    aparelho) e leva a chave junto, para que duas etapas marcadas no mesmo
  --    milissegundo não disputem a mesma linha. O `d` é o dia em Brasília, como
  --    o ymd() do aparelho: uma janela fechada às 22h é do dia dela.
  insert into public.cron_registro (id, dono, d, pid, proj_id, sub_id, proj_t,
                                    sub_t, de, para, vida, motivo, aparelho)
  values (to_char(v_em at time zone 'UTC', 'YYYY-MM-DD"T"HH24-MI-SS-MS"Z"')
            || '-cowork-' || replace(p_chave, '/', '-'),
          v_dono, (v_em at time zone 'America/Sao_Paulo')::date,
          v_partes[1], v_partes[2], v_partes[3], v_proj_t, v_sub->>'t',
          v_de, 2, v_vida, '', 'cowork');

  return v_resp || jsonb_build_object(
    'resultado', 'marcada',
    'em', v_em,
    'mensagem', 'Etapa marcada como concluída. Ela já aparece nos aparelhos.');
end;
$$;

-- REVOGAR DE public, E NÃO SÓ DE anon. O Postgres concede EXECUTE a PUBLIC ao
-- criar a função, e o Supabase ainda o concede a anon e authenticated por
-- privilégio padrão. Ver o cron_e_dono() em cron_estado.sql, que já errou isso.
revoke all on function public.cron_pipeline_marcar(text, boolean)
  from public, anon, authenticated;
grant execute on function public.cron_pipeline_marcar(text, boolean)
  to service_role;
