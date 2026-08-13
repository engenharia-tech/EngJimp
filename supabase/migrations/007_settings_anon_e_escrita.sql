-- =====================================================================
-- 007 — Fecha o M2 (settings legível por anônimo) + trava a ESCRITA
-- =====================================================================
-- SO RODE depois de publicar o código que:
--   (a) busca o branding da tela de login por /api/branding (público, só
--       logo+nome), em vez de ler a tabela `settings` inteira como anônimo;
--   (b) roteia a gravação de configurações por /api/settings/save (servidor).
--
-- Problema 1 (M2): a policy `settings_leitura` (roles {public}, using true)
-- deixava QUALQUER UM — inclusive não logado — ler a tabela inteira:
-- email_to, email_from, templates e hourly_cost. Confirmado.
--
-- Problema 2 (C1-análogo): a policy `usuario_real` (ALL para authenticated)
-- deixava QUALQUER logado (até projetista) ESCREVER em settings — mudar
-- custo/hora, destinatários de e-mail, templates.
--
-- Correção: leitura só para authenticated; escrita só via service_role (o
-- endpoint /api/settings/save confere admin/Edson no crachá). Anônimo perde
-- todo acesso à tabela (o login usa /api/branding).
-- =====================================================================

drop policy if exists "settings_leitura" on public.settings;   -- M2: remove leitura anônima
drop policy if exists "usuario_real"     on public.settings;   -- remove escrita de qualquer logado

create policy "settings_read_auth" on public.settings
  for select to authenticated using (auth.uid() is not null);

-- Sem policy de insert/update/delete => authenticated NÃO escreve.
-- O servidor usa service_role (ignora RLS) e confere o cargo.

notify pgrst, 'reload schema';

-- Conferência:
--   select policyname, roles::text, cmd from pg_policies
--   where schemaname='public' and tablename='settings';  -- deve sobrar só settings_read_auth (SELECT, authenticated)
