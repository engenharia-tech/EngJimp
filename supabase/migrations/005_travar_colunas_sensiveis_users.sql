-- =====================================================================
-- 005 — TRAVAR colunas sensiveis de `users` (defesa em profundidade do C2)
-- =====================================================================
-- SO RODE depois de publicar o codigo que le APENAS colunas seguras
-- (USER_SAFE_COLUMNS) e roteia salario pelo servidor. Ja publicado (commit
-- do C2). Antes disso, o app fazia select('*') e esta trava o quebraria.
--
-- Problema (C2, camada 2): mesmo com o app pedindo so colunas seguras, um
-- usuario logado podia MONTAR A MAO uma consulta no PostgREST
--   GET /rest/v1/users?select=salary,password_hash
-- e ler salario e hash de senha de TODOS. Confirmado ao vivo (retornou
-- salary=18325 e o password_hash do Edson). A RLS filtra LINHAS; isto e
-- por COLUNA — precisa de privilegio de coluna.
--
-- Correcao: `authenticated` deixa de ter SELECT na tabela inteira e passa a
-- ter SELECT so nas colunas NAO sensiveis. salary, password, password_hash,
-- reset_code_hash e reset_code_expires ficam invisiveis para authenticated e
-- anon. O servidor (service_role) e as funcoes SECURITY DEFINER
-- (verify_login etc.) continuam lendo tudo — nao dependem deste grant.
-- =====================================================================

begin;

-- Tira o acesso amplo (tabela inteira) de quem loga e do anonimo.
revoke select on public.users from authenticated;
revoke select on public.users from anon;

-- Devolve SELECT apenas nas colunas seguras. (NAO inclui salary/senha/hash.)
grant select (id, username, name, surname, email, phone, role, created_at, must_set_password)
  on public.users to authenticated;

commit;

-- PostgREST recarrega o schema/privilegios.
notify pgrst, 'reload config';

-- Conferencia (rode como consulta normal do app, token de usuario):
--   select salary from public.users limit 1;   -> deve dar "permission denied for column salary"
--   select id, name, role from public.users;    -> deve funcionar
