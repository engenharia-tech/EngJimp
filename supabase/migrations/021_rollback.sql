-- Rollback da 021 (30/09/2026): devolve ao navegador INSERIR, ALTERAR e APAGAR da tabela okr_state,
-- como estava antes. A LEITURA volta por coluna e SEM o share_token (é como a memória de 25/09 descreve
-- a produção; dar SELECT da tabela inteira abriria o link de todos a quem lê o OKR dos outros).
-- As políticas (RLS) não foram mexidas pela 021 e continuam iguais. O anônimo NÃO é devolvido.
do $$
declare cols text;
begin
  revoke all on table public.okr_state from authenticated;
  grant insert, update, delete on table public.okr_state to authenticated;
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'okr_state' and column_name <> 'share_token';
  execute format('grant select (%s) on table public.okr_state to authenticated', cols);
end
$$;
notify pgrst, 'reload schema';
