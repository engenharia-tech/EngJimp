-- =====================================================================================================
-- 032 — DESFAZER ("administra usuários", a marca do TI). Só em emergência.
-- O Luiz Henrique perde a marca junto (a coluna sai): o servidor novo lê "coluna inexistente" = ninguém administra
-- usuários pela marca, e ele volta ao 403 de antes. Nada mais muda: as contas que ele criou ficam como estão (quem
-- ainda não criou a senha cria pelo código, como sempre).
-- Devolve o gatilho users_teste_molde (031) ao texto de antes (troca inversa, conferindo 1 ocorrência — se a 031 já
-- foi desfeita, não há o que devolver), tira o gatilho users_senha_sorteada, o CHECK users_admin_usuarios_so_comuns e
-- a coluna users.admin_usuarios (o grant da coluna sai junto).
-- E revoga a leitura de users.okr_admin pela tela (o item 6 da 032). A COLUNA okr_admin fica (ela existe desde o OKR);
-- sai só o grant que a 032 deu — a 032 recusa rodar se ele já existisse, então não há outro a perder. Um revoke de
-- COLUNA tira só o privilégio daquela coluna: as outras 15 colunas que a tela lê continuam (provado no ensaio de 07/10).
-- Depois deste desfazer, a Equipe do TI volta a não saber quem é admin de OKR (o servidor segue recusando com 403).
-- ⏱ Espera no máximo 5 s por trava de tabela (lock_timeout): se der "lock timeout", NADA foi gravado — cole de novo.
-- Conferência no fim. Esperado: 0 · 0 · 0 · true · true · 15 (15 = as colunas de users que a tela lia antes da 032,
-- lidas em 07/10; se outra migração der leitura de coluna depois da 032, esse número sobe junto).
-- =====================================================================================================

begin;
set local lock_timeout = '5s';

do $g$
begin
  if length('—') <> 1 then
    raise exception 'ADMIN USUARIOS 032 (desfazer): o texto chegou com os acentos quebrados — nada foi gravado.';
  end if;
  if not exists (select 1 from pg_attribute where attrelid = 'public.users'::regclass and attname = 'admin_usuarios' and not attisdropped) then
    raise exception 'ADMIN USUARIOS 032 (desfazer): a 032 não está no banco (users.admin_usuarios) — nada foi gravado.';
  end if;
end $g$;

-- o molde do teste volta ao texto de antes (ANTES de a coluna sair: senão o gatilho quebraria toda gravação em users)
do $p$
declare
  d text;
  n int;
  velho constant text := $a$new.okr_viewer := false;
  new.admin_usuarios := false;$a$;
  novo constant text := $a$new.okr_viewer := false;$a$;
begin
  if to_regprocedure('public.users_teste_molde()') is null then
    return;   -- a 031 já foi desfeita: o molde não existe
  end if;
  d := pg_get_functiondef('public.users_teste_molde()'::regprocedure);
  n := (length(d) - length(replace(d, velho, ''))) / length(velho);
  if n <> 1 then
    raise exception 'ADMIN USUARIOS 032 (desfazer): em users_teste_molde o trecho [%] aparece % vez(es) (esperava 1) — nada foi gravado.', velho, n;
  end if;
  execute replace(d, velho, novo);
end $p$;

drop trigger if exists users_senha_sorteada on public.users;
drop function if exists public.users_senha_sorteada();

alter table public.users drop constraint if exists users_admin_usuarios_so_comuns;
alter table public.users drop column if exists admin_usuarios;

-- a leitura de okr_admin pela tela (só o grant da COLUNA; a coluna fica)
revoke select (okr_admin) on public.users from authenticated;

commit;

notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: 0 · 0 · 0 · true · true · 15
select
  (select count(*) from pg_attribute where attrelid = 'public.users'::regclass and attname = 'admin_usuarios' and not attisdropped) as coluna,
  (select count(*) from pg_constraint where conname = 'users_admin_usuarios_so_comuns')                                    as check_so_comuns,
  (select count(*) from pg_trigger where tgname = 'users_senha_sorteada')                                                  as gatilho_senha,
  coalesce((select prosrc not like '%admin_usuarios%' from pg_proc where oid = to_regprocedure('public.users_teste_molde()')), true) as teste_como_antes,
  not has_column_privilege('authenticated', 'public.users', 'okr_admin', 'SELECT')                                        as tela_nao_le_admin_okr,
  (select count(*) from information_schema.column_privileges
    where table_schema = 'public' and table_name = 'users' and grantee = 'authenticated' and privilege_type = 'SELECT')    as colunas_que_a_tela_le;
