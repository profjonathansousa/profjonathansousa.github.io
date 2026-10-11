-- ============================================================
-- Cronograma — o relógio dos avisos.
-- Idempotente: pode rodar de novo sem estragar nada.
--
-- POR QUE O RELÓGIO SAIU DO GITHUB. O `schedule` do Actions entra numa fila e
-- atrasa: entre 20/09 e 09/10 o aviso marcado para as 10h saiu entre 13h40 e
-- 17h56 de Brasília. Para um resumo da manhã, isso é não ter resumo. O pg_cron
-- dispara no minuto, e o `workflow_dispatch` que ele chama começa em segundos.
--
-- O QUE NÃO MUDOU: quem envia continua sendo o avisos/enviar.mjs, no Actions,
-- com o código do repositório. O banco só aperta o botão na hora certa.
--
-- O DISPARO NÃO LEVA INPUT NENHUM. O notificador descobre o momento pela hora
-- de São Paulo (avisos/dia.mjs, momentoDaHora). Assim um disparo atrasado
-- demais se recusa sozinho, e um workflow antigo no main não recusa o pedido
-- por "input desconhecido".
-- ============================================================


-- ============================================================
-- 1. O que já foi avisado.
-- ============================================================
-- Até aqui isso morava em scripts/estado_notificador.json, e cada aviso virava
-- um commit no main. O arquivo ficou congelado e o notificador ainda o LÊ, para
-- não repetir nada do que avisou antes da troca.
--
-- Só a service_role toca nesta tabela: nada de anon, nada de authenticated.
create table if not exists public.cron_aviso_enviado (
  id          text primary key,          -- dia:<data>:<momento>, vagas:<lote>, chamada:<id>, evento:<id>:<data>
  enviado_em  date not null,
  criado_em   timestamptz not null default now()
);

alter table public.cron_aviso_enviado enable row level security;
alter table public.cron_aviso_enviado force  row level security;
revoke all on public.cron_aviso_enviado from anon, authenticated;
grant select, insert, delete on public.cron_aviso_enviado to service_role;


-- ============================================================
-- 2. As extensões.
-- ============================================================
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;


-- ============================================================
-- 3. O botão.
-- ============================================================
-- FORA DO `public`, de propósito: tudo em `public` é exposto pela API REST, e
-- uma função que lê um segredo do Vault não tem nada a fazer ali.
create schema if not exists cron_interno;
revoke all on schema cron_interno from public, anon, authenticated;

-- O TOKEN MORA NO VAULT, nunca neste arquivo e nunca no repositório. É um
-- fine-grained token do GitHub com UMA permissão — "Actions: Read and write" —
-- e UM repositório. Para guardá-lo, e também para TROCÁ-LO quando vencer, o
-- mesmo bloco serve (SQL Editor do Supabase): ele cria se não existe, atualiza
-- se existe, e se recusa a rodar sem o token colado.
--
--     do $$
--     declare
--       tok text := trim('COLE_AQUI_O_TOKEN');
--     begin
--       if tok not like 'github_pat_%' and tok not like 'ghp_%' then
--         raise exception 'Cole o token do GitHub (começa com github_pat_) no lugar de COLE_AQUI_O_TOKEN antes de rodar.';
--       end if;
--       if exists (select 1 from vault.secrets where name = 'github_avisos_token') then
--         perform vault.update_secret((select id from vault.secrets where name = 'github_avisos_token'), tok);
--       else
--         perform vault.create_secret(tok, 'github_avisos_token', 'Dispara o avisos.yml do Cronograma');
--       end if;
--     end $$;
--
-- A PRIMEIRA VERSÃO DESTA INSTRUÇÃO ERA UM `create_secret('<o token>', ...)`, e
-- em 11/10/2026 ela foi rodada sem a troca: o Vault guardou o texto de exemplo,
-- e a segunda tentativa caiu em "duplicate key". Daí o bloco acima, e daí a
-- função abaixo recusar o que não tem forma de token.
--
-- SEM O SEGREDO, A FUNÇÃO NÃO FAZ NADA e não reclama: os jobs abaixo podem
-- existir antes do token, e o aviso diário de reserva do GitHub continua.
create or replace function cron_interno.disparar_avisos()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  tok    text;
  pedido bigint;
begin
  select decrypted_secret into tok
    from vault.decrypted_secrets where name = 'github_avisos_token' limit 1;
  if tok is null or tok = '' then
    raise log 'cron_interno.disparar_avisos: falta o segredo github_avisos_token no Vault';
    return null;
  end if;
  -- Texto que não é token (o exemplo da instrução, um espaço colado) não vai
  -- ao GitHub: seria só um 401 por disparo, quatro por dia.
  if tok not like 'github_pat_%' and tok not like 'ghp_%' then
    raise log 'cron_interno.disparar_avisos: o segredo github_avisos_token nao tem forma de token do GitHub';
    return null;
  end if;
  select net.http_post(
    url := 'https://api.github.com/repos/profjonathansousa/profjonathansousa.github.io/actions/workflows/avisos.yml/dispatches',
    body := jsonb_build_object('ref', 'main'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || tok,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'cronograma-avisos',
      'Content-Type', 'application/json'),
    timeout_milliseconds := 10000
  ) into pedido;
  return pedido;
end
$$;

revoke all on function cron_interno.disparar_avisos() from public, anon, authenticated;


-- ============================================================
-- 4. Os horários.
-- ============================================================
-- O pg_cron do Supabase conta em UTC. Brasília é UTC-3 o ano inteiro desde
-- 2019 (sem horário de verão), então a conta é fixa. Cada disparo sai DOIS
-- MINUTOS ANTES do momento: o job do Actions leva perto de um minuto para
-- subir, e o notificador aceita até 15 minutos de antecedência.
--
--   momento  Brasília  disparo (Brasília)  disparo (UTC)
--   manha    06:30     06:28               09:28
--   tarde    13:00     12:58               15:58
--   noite    19:00     18:58               21:58
--   fim      23:00     22:58               01:58 (do dia seguinte, em UTC)
--
-- Mudar um horário é mudar DOIS lugares: a linha aqui e o MOMENTOS no
-- avisos/dia.mjs. Fora da janela do momento, o notificador não manda o resumo.
select cron.schedule('cronograma-avisos-manha', '28 9 * * *',  $$select cron_interno.disparar_avisos()$$);
select cron.schedule('cronograma-avisos-tarde', '58 15 * * *', $$select cron_interno.disparar_avisos()$$);
select cron.schedule('cronograma-avisos-noite', '58 21 * * *', $$select cron_interno.disparar_avisos()$$);
select cron.schedule('cronograma-avisos-fim',   '58 1 * * *',  $$select cron_interno.disparar_avisos()$$);

-- O resumo do dia deixa quatro linhas por dia. Elas só servem para não repetir
-- o aviso no mesmo dia; com um mês, saem. As outras identidades (vagas,
-- chamadas, eventos) ficam: a chamada de fluxo contínuo vive meses, e esquecê-la
-- faria o telefone tocar de novo por ela.
select cron.schedule('cronograma-avisos-poda', '0 7 * * 0',
  $$delete from public.cron_aviso_enviado where id like 'dia:%' and enviado_em < current_date - 30$$);


-- ============================================================
-- Para conferir
-- ============================================================
--   select jobname, schedule, active from cron.job where jobname like 'cronograma-%';
--   select j.jobname, d.status, d.start_time, d.return_message
--     from cron.job_run_details d join cron.job j using (jobid)
--    where j.jobname like 'cronograma-%' order by d.start_time desc limit 10;
--   -- a resposta do GitHub: 204 é "disparado"; 401 é token errado ou vencido
--   select id, status_code, left(content::text, 200) as corpo, created
--     from net._http_response order by created desc limit 10;
