-- ============================================================
-- Cronograma — Fase 8: inscrições de notificação.
-- Idempotente: pode rodar de novo sem estragar nada.
--
-- O CRONOGRAMA NÃO TEM USUÁRIOS. É de uma pessoa só, sem login, sem senha e
-- sem compartilhamento. Por isso esta tabela não tem casa_id, perfil_id, nem
-- política presa a auth.uid(): as inscrições pertencem à própria aplicação, e
-- a coluna `aparelho` é só um rótulo para a pessoa se reconhecer.
--
-- MAS A RLS FICA, e o motivo é duro: a anon key é pública por desenho, e o
-- endpoint de push é uma URL-CAPACIDADE — quem o tem notifica aquele aparelho.
-- Uma tabela legível pelo anon deixaria qualquer um enumerar os endpoints.
-- Então: o anon INSERE e mais nada. Ler, atualizar e apagar é só da
-- service_role, que roda no GitHub Actions e ignora a RLS por desenho.
--
-- O INSERT público foi analisado e aceito: alguém com a chave poderia inserir
-- linha falsa, e o efeito máximo é um envio que falha — que o próprio
-- limpador de 404/410 remove na execução seguinte.
--
-- `anon` E `service_role` AQUI SÃO PAPÉIS DO POSTGRES, NÃO NOMES DE CHAVE. O
-- cliente apresenta a chave *publishable* e o gateway a resolve para o papel
-- `anon`; o Actions apresenta a chave *secret* e ela resolve para
-- `service_role`. Por isso a troca das chaves antigas (anon/service_role) pelo
-- modelo atual do Supabase não altera uma linha deste arquivo: as políticas
-- continuam valendo exatamente do mesmo jeito.
-- ============================================================

create table if not exists public.cron_push_inscricao (
  id            uuid primary key default gen_random_uuid(),
  endpoint      text not null unique,       -- endereço que o navegador dá
  p256dh        text not null,              -- chaves da criptografia da mensagem
  auth          text not null,
  aparelho      text,                       -- rótulo legível, não identidade
  criado_em     timestamptz not null default now(),
  ultimo_envio  timestamptz,
  falhas        int not null default 0,
  ultimo_erro   text
);

alter table public.cron_push_inscricao enable row level security;
alter table public.cron_push_inscricao force  row level security;

-- Uma política só: inscrever. Não há select, update nem delete para o anon,
-- e a ausência é deliberada — sem policy, a RLS nega.
drop policy if exists cron_push_inscrever on public.cron_push_inscricao;
create policy cron_push_inscrever on public.cron_push_inscricao
  for insert to anon with check (true);

revoke all on public.cron_push_inscricao from anon;
grant insert on public.cron_push_inscricao to anon;

-- Desinscrever apaga a linha, e apagar é da service_role. O aparelho que se
-- desinscreve cancela a inscrição no próprio navegador (sub.unsubscribe()), o
-- que já basta: o endpoint morre e o envio seguinte recebe 404/410, e é aí que
-- a linha sai. Dar delete ao anon deixaria qualquer um apagar as inscrições.

select relname as tabela, relrowsecurity as rls, relforcerowsecurity as forcada
from pg_class
where relnamespace = 'public'::regnamespace
  and relname = 'cron_push_inscricao';
