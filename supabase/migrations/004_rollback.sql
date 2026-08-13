-- Rollback da 004: devolve a escrita direta em users ao papel authenticated
-- (volta ao estado da 003). Use se a gestao de usuarios pelo servidor quebrar.
drop policy if exists "users_leitura" on public.users;
create policy "usuario_real" on public.users
  for all to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
notify pgrst, 'reload config';
