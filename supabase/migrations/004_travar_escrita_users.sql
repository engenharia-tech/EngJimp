-- =====================================================================
-- 004 — TRAVAR escrita direta na tabela `users` (fecha C1 da auditoria)
-- =====================================================================
-- SO RODE DEPOIS de publicar o codigo que roteia a gestao de usuarios pelo
-- servidor (/api/users/save e /api/users/delete). Antes disso, a aba Equipe
-- escreve direto e esta trava a quebraria.
--
-- Problema (C1): a politica "usuario_real" era `for all to authenticated`,
-- entao QUALQUER usuario logado podia PATCH/DELETE em users direto pelo
-- PostgREST — virar CEO, sobrescrever a senha de qualquer um (takeover),
-- apagar gente. Confirmado ao vivo: token de projetista -> PATCH role=CEO -> 204.
--
-- Correcao: em `users`, authenticated so pode LER. Toda escrita passa a ser
-- do service_role (servidor /api, que confere o cargo no cracha). O
-- service_role ignora a RLS. As OUTRAS tabelas seguem com a politica atual.
-- =====================================================================

drop policy if exists "usuario_real" on public.users;
drop policy if exists "logado_acesso_total" on public.users;

-- Leitura: qualquer usuario logado (com cracha de usuario real).
create policy "users_leitura" on public.users
  for select to authenticated using (auth.uid() is not null);

-- SEM policy de insert/update/delete para authenticated => negado.
-- (o servidor usa service_role, que ignora a RLS.)

notify pgrst, 'reload config';

-- Conferencia: deve listar so a policy de SELECT em users
--   select policyname, cmd from pg_policies
--   where schemaname='public' and tablename='users';
