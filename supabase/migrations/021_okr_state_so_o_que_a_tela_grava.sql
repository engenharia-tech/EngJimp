-- =====================================================================================================
-- 021 — OKR: o navegador só grava o que a tela grava (30/09/2026)
--
-- Antes (lido no banco de produção em 30/09): o papel 'authenticated' tinha DELETE e UPDATE da tabela
--   inteira em okr_state, inclusive da coluna share_token (e, pelo padrão do Supabase, TRUNCATE). Com a
--   política okr_master_all (FOR ALL), um admin de OKR — o Nascimento e, desde 30/09, o Paulo e o Julio —
--   conseguia, por uma chamada direta à API (nenhuma tela faz isso), APAGAR o OKR de qualquer pessoa
--   (inclusive a linha 'edson', com a Governança) ou PÔR UM LINK PÚBLICO no OKR de outra pessoa. A regra
--   é: cada um compartilha o SEU; o dos outros, só o Edson (/api/okr/share, no servidor).
-- Agora: o navegador perde TUDO em okr_state e recebe de volta só o que a tela usa
--   (storageService.saveOkrIfUnchanged): INSERIR (owner_key, data, updated_at), ALTERAR (data, updated_at)
--   e LER todas as colunas MENOS o share_token (o link é entregue pelo servidor a quem pode). Apagar,
--   esvaziar e mexer no link: só o servidor. O anônimo (sem login) perde qualquer acesso direto (o painel
--   público passa pelo servidor).
-- Não muda: QUEM lê/grava o OKR de QUEM (as políticas ficam iguais) e as funções do OKR.
-- Trava: se alguma função que o navegador executa mexer em okr_state SEM ser SECURITY DEFINER (ela
--   dependeria dos privilégios que saem) — inclusive gatilho de OUTRA tabela —, para com erro e NADA muda.
-- Pode rodar de novo. Rollback: 021_rollback.sql.
-- =====================================================================================================

do $$
declare
  dependentes text;
  cols text;
begin
  select string_agg(p.proname, ', ') into dependentes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and not p.prosecdef
     and pg_get_functiondef(p.oid) ilike '%okr_state%'
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     -- gatilho ligado SÓ a okr_state (ex.: okr_state_exige_versao) só confere a linha: não precisa de
     -- privilégio; gatilho de OUTRA tabela que mexe em okr_state conta como dependente.
     and not (p.prorettype = 'trigger'::regtype
              and not exists (select 1 from pg_trigger t
                               where t.tgfoid = p.oid and t.tgrelid <> 'public.okr_state'::regclass));
  if dependentes is not null then
    raise exception 'OKR 021: estas funções mexem em okr_state com os privilégios de quem chama: %. Nada foi mudado — chame o Claude.', dependentes;
  end if;
  -- Gatilho em okr_state além do conhecido (okr_state_exige_versao, que só confere a versão): um que
  -- GRAVE em okr_state com os privilégios de quem chama quebraria depois desta migração. Na dúvida, para.
  select string_agg(t.tgname, ', ') into dependentes
    from pg_trigger t join pg_proc p on p.oid = t.tgfoid
   where t.tgrelid = 'public.okr_state'::regclass
     and not t.tgisinternal
     and t.tgname <> 'okr_state_exige_versao'
     and not p.prosecdef;
  if dependentes is not null then
    raise exception 'OKR 021: há gatilho(s) em okr_state que eu não conheço: %. Nada foi mudado — chame o Claude.', dependentes;
  end if;

  revoke all on table public.okr_state from anon;
  revoke all on table public.okr_state from authenticated;   -- tira também os grants de coluna
  grant insert (owner_key, data, updated_at) on table public.okr_state to authenticated;
  grant update (data, updated_at) on table public.okr_state to authenticated;

  -- Leitura: todas as colunas menos o share_token (lidas do próprio banco, para não esquecer nenhuma).
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'okr_state' and column_name <> 'share_token';
  execute format('grant select (%s) on table public.okr_state to authenticated', cols);

  -- Confere o RESULTADO antes de terminar: se algum revoke não pegou (ex.: privilégio dado por outro
  -- papel), a migração inteira é desfeita em vez de depender de alguém ler a conferência.
  if not (has_column_privilege('authenticated', 'public.okr_state', 'data', 'SELECT')
      and has_column_privilege('authenticated', 'public.okr_state', 'updated_at', 'SELECT')
      and has_column_privilege('authenticated', 'public.okr_state', 'owner_key', 'INSERT')
      and has_column_privilege('authenticated', 'public.okr_state', 'updated_at', 'INSERT')
      and has_column_privilege('authenticated', 'public.okr_state', 'data', 'UPDATE')
      and has_column_privilege('authenticated', 'public.okr_state', 'updated_at', 'UPDATE'))
     or has_table_privilege('authenticated', 'public.okr_state', 'DELETE')
     or has_table_privilege('authenticated', 'public.okr_state', 'TRUNCATE')
     or has_column_privilege('authenticated', 'public.okr_state', 'owner_key', 'UPDATE')
     or has_column_privilege('authenticated', 'public.okr_state', 'share_token', 'UPDATE')
     or has_column_privilege('authenticated', 'public.okr_state', 'share_token', 'INSERT')
     or has_column_privilege('authenticated', 'public.okr_state', 'share_token', 'SELECT')
     or has_any_column_privilege('anon', 'public.okr_state', 'SELECT') then
    raise exception 'OKR 021: os privilégios não ficaram como deviam (algum revoke não pegou). Nada foi mudado — chame o Claude.';
  end if;
end
$$;

notify pgrst, 'reload schema';

-- Conferência (só lê). Esperado: as 6 primeiras true; as 7 seguintes false;
-- ligacoes_com_usuarios mostra tabela.coluna de cada ligação com users (para conferir a trava de exclusão).
select
  has_column_privilege('authenticated', 'public.okr_state', 'data', 'SELECT')          as le_okr,
  has_column_privilege('authenticated', 'public.okr_state', 'updated_at', 'SELECT')    as le_versao,
  has_column_privilege('authenticated', 'public.okr_state', 'owner_key', 'INSERT')     as cria_okr,
  has_column_privilege('authenticated', 'public.okr_state', 'updated_at', 'INSERT')    as cria_versao,
  has_column_privilege('authenticated', 'public.okr_state', 'data', 'UPDATE')          as altera_okr,
  has_column_privilege('authenticated', 'public.okr_state', 'updated_at', 'UPDATE')    as altera_versao,
  has_table_privilege('authenticated', 'public.okr_state', 'DELETE')                   as apaga_okr,
  has_table_privilege('authenticated', 'public.okr_state', 'TRUNCATE')                 as esvazia_tabela,
  has_column_privilege('authenticated', 'public.okr_state', 'owner_key', 'UPDATE')     as troca_dono,
  has_column_privilege('authenticated', 'public.okr_state', 'share_token', 'UPDATE')   as mexe_no_link,
  has_column_privilege('authenticated', 'public.okr_state', 'share_token', 'INSERT')   as cria_com_link,
  has_column_privilege('authenticated', 'public.okr_state', 'share_token', 'SELECT')   as le_o_link,
  has_any_column_privilege('anon', 'public.okr_state', 'SELECT')                       as anonimo_le,
  (select string_agg(c.conrelid::regclass::text || '.' || a.attname, ', ' order by c.conrelid::regclass::text, a.attname)
     from pg_constraint c
     join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'public.users'::regclass)               as ligacoes_com_usuarios;
