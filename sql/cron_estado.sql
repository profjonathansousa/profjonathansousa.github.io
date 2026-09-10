-- ============================================================
-- Cronograma — Fase 9A: o estado compartilhado online.
-- Idempotente: pode rodar de novo sem estragar nada.
--
-- O QUE MUDA, EM UMA FRASE. Até a Fase 8 o estado do Cronograma pertencia ao
-- APARELHO e era conciliado depois, por um caminho eventual (toques -> GitHub
-- -> dobrar_toques.py -> estado.json -> aparelhos). A partir daqui o estado
-- pertence à CONTA, mora aqui, e os aparelhos são vistas dele.
--
-- O QUE NÃO MUDA, e é o mais importante: a regra de conciliação. Vence o
-- relógio, item a item; empate fica como está; mais antigo é ignorado; apagar
-- deixa lápide. Os sete domínios que já atravessavam aparelhos desde a Fase 6
-- já obedeciam a essa regra, cada um com um aplicador escrito à mão. Este
-- esquema não a inventa — ele a torna uma coisa só, e o servidor passa a
-- garanti-la em vez de confiar em oito trechos de JavaScript.
--
-- ============================================================
-- AS QUATRO DECISÕES QUE ESTE ARQUIVO IMPLEMENTA
-- ============================================================
--
-- 1. CONTA ÚNICA, AUTENTICADA. O Cronograma continua sendo de uma pessoa só,
--    mas agora tem login: e-mail e senha, uma conta criada à mão no painel,
--    CADASTRO PÚBLICO DESLIGADO. A razão é dura e vale reler antes de mexer
--    em qualquer política aqui:
--
--      a Fase 8 pôde usar a chave publishable — que é pública por desenho e
--      está versionada em js/00-config.js, num repositório público — porque a
--      RLS de cron_push_inscricao permite APENAS INSERT e não devolve linha
--      nenhuma. Não há o que ler.
--
--      Este esquema é o oposto: ele existe para ser lido e reescrito. Com uma
--      política `to anon using (true)`, a chave publishable versionada daria a
--      qualquer pessoa na internet o Cronograma inteiro, para ler e para
--      escrever. Por isso: NADA aqui é acessível ao papel `anon`. Toda
--      política exige `authenticated` E `dono = auth.uid()`.
--
--      Se um dia alguém for tentado a "só liberar leitura para o anon para
--      testar", a resposta é não: o teste é fazer login.
--
-- 2. O RELÓGIO É O DO APARELHO, NÃO O DO SERVIDOR. Parece contraintuitivo com
--    um Postgres na frente, e é deliberado. `em` é o instante monotônico
--    gerado por instanteDoToque() no aparelho que decidiu a mudança. Se o
--    LWW usasse now(), uma marcação feita OFFLINE às 9h e enviada às 18h
--    venceria a marcação legítima das 17h no outro aparelho — a fila offline
--    passaria a corromper o estado em vez de preservá-lo. É exatamente o que a
--    Fase 6 evitou ao publicar as migrações com instante ANTIGO.
--    `servidor_em` existe, mas é AUDITORIA. Nunca decide nada.
--
-- 3. A BASE PRIVADA MUDA O QUE PODE VIAJAR. Três remendos existiam só porque o
--    repositório é público e o histórico nunca é podado:
--      · o `motivo` não viajava (semMotivo() no 10-nucleo.js);
--      · o título de evento privado não viajava;
--      · cron:checks: e cron:hoje-dispensados eram locais "por decisão".
--    Nenhuma dessas razões sobrevive a uma base privada e podável. As três
--    passam a viajar. O que continua local é `cron:contexto` (casa/fora), e
--    por uma razão diferente, que NÃO morre: onde você está é um fato físico
--    do aparelho, e sincronizá-lo faria o Mac em casa achar que saiu.
--
-- 4. UMA LINHA POR ITEM, NUNCA UM JSON GIGANTE. Marcar uma etapa de um trilho
--    não pode reescrever todos os trilhos — nem no tráfego, nem no Realtime,
--    nem no conflito. A tabela é genérica na FORMA (dominio + chave + valor),
--    mas a granularidade é a do ITEM: cada subitem, cada meta, cada vaga é uma
--    linha própria, com o seu próprio relógio e o seu próprio evento Realtime.
--    A forma genérica é o que permite UM aplicador em vez de oito, e é uma
--    tradução mecânica do estado.json — o que torna a Fase 9F (escrita dupla
--    com comparação diária) possível de verificar linha a linha.
-- ============================================================


-- ============================================================
-- TABELA 0 — cron_dono: quem é dono de um Cronograma.
-- ============================================================
--
-- ESTE PROJETO SUPABASE É COMPARTILHADO com o CONTAS_CASA, que já tem os seus
-- próprios usuários em auth.users. A autenticação, portanto, é compartilhada no
-- nível do projeto — mas ESTAR AUTENTICADO NÃO FAZ DE NINGUÉM DONO DE UM
-- CRONOGRAMA.
--
-- Sem esta tabela, `dono = auth.uid()` daria isolamento de LEITURA correto (cada
-- um veria só o que é seu) mas deixaria qualquer conta do projeto CRIAR linhas
-- de Cronograma. Isolamento por acidente não é isolamento: ele depende de
-- ninguém apontar outro aplicativo para estas tabelas.
--
-- A allowlist é populada SÓ pela service_role, à mão, uma vez:
--
--     insert into public.cron_dono (uid, rotulo)
--     select id, 'jonathan' from auth.users where email = '...';
--
-- O app pode LER a própria linha — é assim que a tela distingue "você entrou
-- com uma conta que não é dona deste Cronograma" de "você não entrou". Não pode
-- escrever: a ausência de política de INSERT é o ponto.
create table if not exists public.cron_dono (
  uid        uuid primary key references auth.users(id) on delete cascade,
  rotulo     text,
  criado_em  timestamptz not null default now()
);

-- No molde de minha_casa(), que o CONTAS_CASA já usa: STABLE (avaliada uma vez
-- por consulta, não por linha) e SECURITY DEFINER, porque a política precisa
-- consultar cron_dono independentemente da RLS da própria cron_dono — senão a
-- verificação dependeria da permissão que ela mesma concede.
create or replace function public.cron_e_dono()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.cron_dono where uid = auth.uid());
$$;

alter table public.cron_dono enable row level security;
alter table public.cron_dono force  row level security;

drop policy if exists cron_dono_ler on public.cron_dono;
create policy cron_dono_ler on public.cron_dono
  for select to authenticated using (uid = auth.uid());

revoke all    on public.cron_dono        from anon;
grant  select on public.cron_dono        to   authenticated;

-- REVOGAR DE `anon` NAO BASTA, e este arquivo ja errou isso uma vez. O Postgres
-- concede EXECUTE a PUBLIC por padrao ao criar a funcao, e `anon` herda de
-- PUBLIC: sem revogar de PUBLIC, a funcao continuava exposta em
-- /rest/v1/rpc/cron_e_dono para quem tem a chave publishable — que e publica por
-- desenho e esta versionada num repositorio publico.
--
-- Nao havia vazamento (sem sessao, auth.uid() e nulo e ela devolve sempre
-- false), mas a intencao declarada era negar, e negar de verdade custa uma
-- linha. O linter do Supabase pegou; o cron_podar() abaixo ja revogava de
-- `public` e por isso passou limpo.
revoke all     on function public.cron_e_dono() from public;
revoke all     on function public.cron_e_dono() from anon;
grant  execute on function public.cron_e_dono() to authenticated;


-- ============================================================
-- TABELA 1 — cron_estado: tudo que é estado corrente e mutável.
-- ============================================================
--
-- OS ONZE DOMÍNIOS, e a chave de cada um. A lista é fechada por um CHECK, e a
-- rigidez é de propósito: acrescentar domínio é uma migração de uma linha, e
-- este arquivo passa a ser a documentação executável do que atravessa
-- aparelhos. Um domínio digitado errado vira linha órfã que ninguém lê — que é
-- pior do que um erro na hora de gravar.
--
--   item            painel/projeto/subitem   {st, vida, motivo, voltar_em, vidaDesde}
--   estrutura_proj  painel/projeto           {t, n, mes}
--   estrutura_sub   painel/projeto/subitem   {t, n, onde, prova, medida, ordem}
--   triagem         idDaVaga                 {st}
--   meta            AAAA-MM/id               {t, done, de}
--   evento          idDoEvento               {t, data, priv}
--   prioridade      AAAA-Wnn/id              {tipo, painel, projId, t, feito_em}
--   toefl           idDoItemDoGuia           {feito}
--   retomada        painel/projeto           {ate}
--   rotina          AAAA-MM-DD/idDaRotina    {feito}
--   dispensa        rotina/AAAA-MM-DD/id     {}   |   meta-aviso/AAAA-MM   {}
--
-- POR QUE `item` E `estrutura_sub` SÃO LINHAS SEPARADAS PARA O MESMO SUBITEM.
-- Esta é a resposta ao único conflito real da Fase 9: o pipeline e você
-- escrevendo nos mesmos Trilhos.
--
--   · PROGRESSO (`item`) já é de dois escritores hoje, e funciona: o
--     dobrar_toques.py --registrar publica com aparelho "cowork" e entra pela
--     mesma porta que o iPhone. O LWW resolve. E a fronteira do que a máquina
--     PODE afirmar já está no dado: --registrar RECUSA subitem de
--     prova "estrela" — as etapas cuja conclusão é decisão do autor.
--     Nada disso muda aqui. O pipeline é mais um aparelho.
--
--   · ESTRUTURA (`estrutura_*`) é onde o conflito mora, e a separação em
--     linhas o contém: o pipeline escreve estrutura, você escreve progresso, e
--     no caso comum eles nem tocam na mesma linha. Sobra renomear e criar, que
--     é o que a TABELA 3 resolve.
--
-- POR QUE NÃO HÁ MAIS `cron:arquivo`. Apagar um projeto ou subitem deixou de
-- ser um mecanismo próprio (splice do array + gaveta paralela indexada por
-- POSIÇÃO, que se desloca) e passou a ser `vida = 'arquivado'` — um valor que o
-- esquema v2 já declarava em 2026 e nunca usava. Restaurar é `vida = 'ativo'`.
-- Com isso apagar e restaurar viram atualizações de campo comuns, que o LWW já
-- sabe resolver e que já viajam. A aba Arquivo passa a ser um filtro.
-- Ver README, "Fase 9 · O que deixou de ser caso especial".
create table if not exists public.cron_estado (
  dono         uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  dominio      text        not null,
  chave        text        not null,
  valor        jsonb       not null default '{}'::jsonb,

  -- LÁPIDE, e não DELETE. "Ausência não é desconhecimento" é regra do
  -- Cronograma desde a Fase 2: um aparelho que só volta a abrir daqui a um mês
  -- precisa saber que a meta foi APAGADA, e não que ele nunca a viu. Apagar a
  -- linha faria o aparelho antigo recriá-la na próxima subida.
  del          boolean     not null default false,

  -- O RELÓGIO QUE DECIDE. Instante do APARELHO (ver decisão 2, no topo).
  em           timestamptz not null,

  -- Quem escreveu. Serve para o Realtime não ecoar de volta para quem acabou
  -- de escrever — o "receber não é tocar" do 10-nucleo.js, que com Realtime
  -- fica mais perigoso porque a volta é rápida o bastante para virar laço.
  -- "cowork" é o valor que o pipeline usa, e é um aparelho como os outros.
  aparelho     text        not null,

  -- Só `rotina` e `dispensa` preenchem. Null = nunca expira. Ver cron_podar().
  expira_em    timestamptz,

  -- AUDITORIA. Nunca decide nada. Ver decisão 2.
  servidor_em  timestamptz not null default now(),

  primary key (dono, dominio, chave),

  constraint cron_estado_dominio_conhecido check (dominio in (
    'item', 'estrutura_proj', 'estrutura_sub', 'triagem', 'meta', 'evento',
    'prioridade', 'toefl', 'retomada', 'rotina', 'dispensa'
  ))
);

-- A leitura quente é "todo o domínio X desta conta", feita na abertura do app
-- e no catch-up de reconexão. A PK já cobre (dono, dominio, chave), então este
-- índice é redundante com ela para o prefixo — fica só o de expiração, que
-- serve à poda e não tem outro caminho.
create index if not exists cron_estado_expira
  on public.cron_estado (expira_em) where expira_em is not null;

-- Catch-up incremental: "o que mudou desde que perdi a conexão". É o caminho
-- principal no iPhone, onde o Safari mata o WebSocket em segundo plano e o
-- normal é reconectar, não receber o evento.
create index if not exists cron_estado_delta
  on public.cron_estado (dono, servidor_em desc);


-- ============================================================
-- GATILHO — o relógio, garantido pelo servidor.
-- ============================================================
--
-- Aqui está a diferença entre a Fase 9 e o que havia antes. Até agora "vence o
-- relógio" era uma promessa cumprida por oito trechos de JavaScript, cada um
-- reimplementando `if((x.em || "") >= r.quando) return;`. Um deles com o
-- comparador trocado passaria despercebido por meses.
--
-- Agora é o Postgres que recusa. Um UPDATE cujo `em` não seja estritamente
-- mais novo é DESCARTADO EM SILÊNCIO — que é literalmente a regra escrita:
-- "mais novo manda, empate fica como está, mais antigo é ignorado".
--
-- `return null` num BEFORE UPDATE cancela a atualização daquela linha sem erro
-- e sem abortar a transação: um lote com dez itens, três deles atrasados,
-- grava os sete bons. É o comportamento certo para uma fila offline sendo
-- drenada, que é justamente onde toque atrasado aparece.
create or replace function public.cron_estado_relogio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.em <= old.em then
    return null;                      -- toque atrasado: não manda no estado
  end if;
  new.servidor_em := now();           -- auditoria, sempre do servidor
  return new;
end;
$$;

drop trigger if exists cron_estado_relogio on public.cron_estado;
create trigger cron_estado_relogio
  before insert or update on public.cron_estado
  for each row execute function public.cron_estado_relogio();


-- ============================================================
-- TABELA 2 — cron_registro: o histórico datado. Só cresce.
-- ============================================================
--
-- Não é estado corrente e por isso não mora na tabela acima: não existe
-- "vence o mais recente" para o registro — cada linha vale por si. É a mesma
-- razão pela qual o estado.json guarda o registro em `historico`, e não numa
-- seção com relógio.
--
-- A CHAVE É O ID DO TOQUE, que já nasce único por aparelho
-- (instante ISO + id do aparelho, ver enfileirarToque). É por ele que reler
-- não duplica, e é o que permite aposentar a regra "toque meu não desce nunca"
-- do 10-nucleo.js: aquela regra existia porque as linhas antigas não tinham
-- `tid`; aqui toda linha tem chave primária, por construção.
--
-- O `motivo` VIAJA, e esta é a primeira dívida da base pública a ser paga. O
-- semMotivo() existia porque o motivo é texto livre e o repositório é público
-- e nunca podado. Numa base privada ele é só um campo. O rótulo
-- "motivo registrado no outro aparelho" pode sair da tela.
create table if not exists public.cron_registro (
  id           text        not null,          -- id do toque: ISO + aparelho
  dono         uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  d            date        not null,          -- o dia da mudança, não o do envio
  pid          text        not null,          -- painel
  proj_id      text        not null,
  sub_id       text        not null,
  proj_t       text,                          -- título fotografado no momento
  sub_t        text,                          -- idem: renomear não orfana o log
  de           int,                           -- st anterior (null = desconhecido)
  para         int         not null,          -- st novo
  vida         text        not null default 'ativo',
  motivo       text        not null default '',
  aparelho     text        not null,
  servidor_em  timestamptz not null default now(),
  primary key (dono, id)
);

create index if not exists cron_registro_por_dia
  on public.cron_registro (dono, d desc);


-- ============================================================
-- TABELA 3 — cron_estrutura_base: o merge de três vias.
-- ============================================================
--
-- O PROBLEMA QUE ESTA TABELA RESOLVE. Hoje o mesclarEntrada() compara o que o
-- entrada.json diz contra o que está no aparelho e conclui que discordância
-- significa desatualização:
--
--     10-nucleo.js:104   if(novo.t && novo.t!==alvo.t){ alvo.t=novo.t; ... }
--
-- Mas discordância também pode significar QUE VOCÊ EDITOU. Hoje, renomear um
-- projeto à mão é desfeito pela próxima publicação do pipeline, em silêncio.
-- Isto não é consequência da Fase 9; é verdade desde a Fase 4. A Fase 9 apenas
-- o torna visível, ao dar ao rename um caminho de sincronização.
--
-- A CAUSA é o merge ser de DUAS vias. A correção é uma terceira: guardar o que
-- o pipeline PUBLICOU da última vez. Com ela, a regra passa a ser, campo a
-- campo:
--
--     o campo mudou no entrada.json desde a última publicação?
--        não  -> não escreve. O que você editou à mão sobrevive.
--        sim  -> você também mudou esse campo depois?
--                não -> escreve. É atualização legítima do pipeline.
--                sim -> conflito real: vence o relógio, e fica registrado.
--
-- Não há hierarquia entre escritores. Cada um manda no que efetivamente mexeu.
--
-- QUEM ESCREVE AQUI É SÓ O PIPELINE. A RLS abaixo dá ao app apenas SELECT, e a
-- ausência de política de escrita é o ponto: se o app pudesse reescrever a
-- base, ele poderia forjar "o pipeline nunca mudou isso" e o merge de três
-- vias viraria de duas outra vez. A escrita sai do Actions, com a chave secret.
create table if not exists public.cron_estrutura_base (
  dono         uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  chave        text        not null,          -- painel/proj  ou  painel/proj/sub
  tipo         text        not null,
  valor        jsonb       not null,          -- o que o pipeline publicou
  gerado_em    timestamptz not null,          -- o _gerado_em do entrada.json
  servidor_em  timestamptz not null default now(),
  primary key (dono, chave),
  constraint cron_estrutura_base_tipo check (tipo in ('projeto', 'subitem'))
);


-- A SUBSTITUIÇÃO DA BASE, NUMA TRANSAÇÃO SÓ.
--
-- Publicar a estrutura é substituir *toda* a base daquele dono pela versão que
-- acabou de ser publicada: gravar o que existe agora e retirar o que deixou de
-- existir. Em chamadas separadas — um POST por lote, um DELETE por peça — uma
-- falha no meio deixa a base pela metade, e uma base pela metade é pior do que
-- base nenhuma: ela AFIRMA que o pipeline publicou uma coisa que ele não
-- publicou, e o merge de três vias passa a decidir com base numa mentira, em
-- silêncio. Compensar depois não resolve — a compensação também pode falhar.
--
-- Por isso a substituição inteira mora aqui, numa função. O PostgREST executa
-- cada chamada dentro de uma transação: ou a base fica sendo exatamente a
-- estrutura publicada, ou continua sendo exatamente a anterior. Não há terceiro
-- estado, e é isso que torna verdadeira a garantia que o publicador anuncia.
--
-- ARRAY VAZIO É RECUSADO, e não tratado como "publicar nada". Uma publicação
-- vazia apagaria a base inteira, que é o efeito mais destrutivo possível aqui, e
-- quase sempre significa arquivo malformado a montante. Recusar é o que impede
-- que um erro de geração vire perda de dado.
--
-- QUEM CHAMA É SÓ A service_role, como no cron_podar(). O app não pode chamá-la:
-- se pudesse, poderia reescrever a base e forjar "o pipeline nunca mudou isso" —
-- e o merge de três vias viraria de duas outra vez. É a mesma razão pela qual a
-- tabela não tem política de escrita.
create or replace function public.cron_publicar_estrutura(
  p_dono      uuid,
  p_gerado_em timestamptz,
  p_linhas    jsonb            -- [{chave, tipo, valor}, ...]
)
returns table (gravadas bigint, retiradas bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gravadas  bigint;
  v_retiradas bigint;
begin
  if p_dono is null or p_gerado_em is null then
    raise exception 'cron_publicar_estrutura: dono e gerado_em sao obrigatorios';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'cron_publicar_estrutura: p_linhas precisa ser um array';
  end if;
  if jsonb_array_length(p_linhas) = 0 then
    raise exception 'cron_publicar_estrutura: estrutura vazia nao e publicacao, e apagaria a base';
  end if;

  with nova as (
    select l->>'chave' as chave, l->>'tipo' as tipo, l->'valor' as valor
      from jsonb_array_elements(p_linhas) as l
  ),
  gravar as (
    insert into public.cron_estrutura_base (dono, chave, tipo, valor, gerado_em)
    select p_dono, chave, tipo, coalesce(valor, '{}'::jsonb), p_gerado_em
      from nova
    on conflict (dono, chave) do update
      set tipo        = excluded.tipo,
          valor       = excluded.valor,
          gerado_em   = excluded.gerado_em,
          servidor_em = now()
    returning 1
  )
  select count(*) into v_gravadas from gravar;

  -- `not exists`, e não `not in`: um `chave` nulo no array faria o `not in`
  -- devolver zero linhas e a retirada não aconteceria — em silêncio.
  delete from public.cron_estrutura_base b
   where b.dono = p_dono
     and not exists (
       select 1 from jsonb_array_elements(p_linhas) as l
        where l->>'chave' = b.chave);
  get diagnostics v_retiradas = row_count;

  return query select v_gravadas, v_retiradas;
end;
$$;

revoke all on function public.cron_publicar_estrutura(uuid, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.cron_publicar_estrutura(uuid, timestamptz, jsonb)
  to service_role;


-- ============================================================
-- PODA — o que a base privada finalmente permite.
-- ============================================================
--
-- `cron:checks:` e `cron:hoje-dispensados` eram locais por um motivo só:
-- "histórico permanente em repositório público por um valor que morre numa
-- semana". Numa base privada e podável o motivo não sobrevive, e as duas
-- passam a viajar — marcar uma rotina no Mac e o iPhone mostrar o dia
-- incompleto é exatamente a discordância que faz alguém deixar de confiar no
-- app.
--
-- Mas "pode viajar" não é "deve durar para sempre". atrasadas() lê no máximo
-- ATRASO_DIAS (7) para trás, e a revisão dominical lê a semana corrente.
-- Marcação de rotina com mais de 90 dias não é lida por ninguém.
--
-- O QUE NUNCA É PODADO continua não sendo: cron_registro e as lápides de
-- cron_estado. A regra "nada se perde" vale para decisão; não vale para o
-- rastro de uma rotina que morreu de velha.
--
-- Chamada pelo Actions (chave secret), junto do envio de avisos. Não exige
-- pg_cron.
create or replace function public.cron_podar()
returns table (podados bigint)
language plpgsql
set search_path = public
as $$
begin
  return query
  with mortos as (
    delete from public.cron_estado
     where expira_em is not null and expira_em < now()
    returning 1
  )
  select count(*)::bigint from mortos;
end;
$$;

revoke all on function public.cron_podar() from public, anon, authenticated;
grant execute on function public.cron_podar() to service_role;


-- ============================================================
-- RLS — nada aqui é do `anon`. Ver decisão 1, no topo.
-- ============================================================
alter table public.cron_estado         enable row level security;
alter table public.cron_estado         force  row level security;
alter table public.cron_registro       enable row level security;
alter table public.cron_registro       force  row level security;
alter table public.cron_estrutura_base enable row level security;
alter table public.cron_estrutura_base force  row level security;

-- Estado: uma política POR COMANDO, e não `for all`. A diferença importa: com
-- `for all`, um DELETE passaria a ser permitido no instante em que alguém
-- concedesse o grant — e a lápide, que é o que impede um aparelho parado há um
-- mês de recriar o que foi apagado, ficaria destruível por descuido. Aqui a
-- ausência de política de DELETE é explícita e visível em pg_policies.
--
-- `cron_e_dono()` em toda cláusula: estar autenticado neste projeto não faz de
-- ninguém dono de um Cronograma. Ver TABELA 0.
drop policy if exists cron_estado_dono    on public.cron_estado;
drop policy if exists cron_estado_ler     on public.cron_estado;
drop policy if exists cron_estado_criar   on public.cron_estado;
drop policy if exists cron_estado_editar  on public.cron_estado;

create policy cron_estado_ler on public.cron_estado
  for select to authenticated
  using (dono = auth.uid() and cron_e_dono());

create policy cron_estado_criar on public.cron_estado
  for insert to authenticated
  with check (dono = auth.uid() and cron_e_dono());

create policy cron_estado_editar on public.cron_estado
  for update to authenticated
  using      (dono = auth.uid() and cron_e_dono())
  with check (dono = auth.uid() and cron_e_dono());

-- Registro: escreve e lê; NÃO atualiza e NÃO apaga. É append-only, e a
-- ausência das duas políticas é o que garante isso — sem policy, a RLS nega.
-- Podar o registro, se um dia for preciso, é da service_role.
drop policy if exists cron_registro_ler    on public.cron_registro;
drop policy if exists cron_registro_gravar on public.cron_registro;
create policy cron_registro_ler on public.cron_registro
  for select to authenticated
  using (dono = auth.uid() and cron_e_dono());
create policy cron_registro_gravar on public.cron_registro
  for insert to authenticated
  with check (dono = auth.uid() and cron_e_dono());

-- Base da estrutura: o app LÊ e não escreve. Ver a TABELA 3.
drop policy if exists cron_estrutura_base_ler on public.cron_estrutura_base;
create policy cron_estrutura_base_ler on public.cron_estrutura_base
  for select to authenticated
  using (dono = auth.uid() and cron_e_dono());

revoke all on public.cron_estado         from anon;
revoke all on public.cron_registro       from anon;
revoke all on public.cron_estrutura_base from anon;

-- SEM `delete` PARA O APP, e a ausência é o desenho: apagar é `del = true`,
-- não sumir com a linha. Um app que pudesse deletar poderia destruir a lápide,
-- e o aparelho que só reabre daqui a um mês recriaria o que foi apagado.
-- Remover linha de verdade é da service_role, e só por expiração (cron_podar).
grant select, insert, update on public.cron_estado         to authenticated;
grant select, insert         on public.cron_registro       to authenticated;
grant select                 on public.cron_estrutura_base to authenticated;


-- ============================================================
-- REALTIME — a razão de tudo isto existir.
-- ============================================================
--
-- postgres_changes respeita a RLS com o JWT da sessão: cada aparelho só recebe
-- evento das linhas que já poderia ler. Não há canal público.
--
-- O aparelho IGNORA o evento cujo `aparelho` seja o seu — "receber não é
-- tocar", agora contra um laço que fecha em milissegundos em vez de minutos.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'cron_estado'
  ) then
    alter publication supabase_realtime add table public.cron_estado;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'cron_registro'
  ) then
    alter publication supabase_realtime add table public.cron_registro;
  end if;
end $$;

-- REPLICA IDENTITY FULL: sem isto, o payload de UPDATE traz só a PK nas
-- colunas antigas, e o aparelho não consegue saber o que mudou sem reler.
alter table public.cron_estado   replica identity full;
alter table public.cron_registro replica identity full;


-- ============================================================
-- CONFERÊNCIA
-- ============================================================
select relname as tabela, relrowsecurity as rls, relforcerowsecurity as forcada
  from pg_class
 where relnamespace = 'public'::regnamespace
   and relname in ('cron_dono', 'cron_estado', 'cron_registro',
                   'cron_estrutura_base', 'cron_push_inscricao')
 order by relname;
