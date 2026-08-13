-- Rollback da 005: devolve o SELECT amplo (tabela inteira) de `users`.
-- Use so em emergencia — reexpoe salary/senha/hash a qualquer usuario logado
-- que monte a consulta a mao. A RLS (004) continua barrando ESCRITA.
begin;
revoke select (id, username, name, surname, email, phone, role, created_at, must_set_password)
  on public.users from authenticated;
grant select on public.users to authenticated;
grant select on public.users to anon;
commit;
notify pgrst, 'reload config';
