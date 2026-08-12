-- =====================================================================
-- 003 — LIGAR A RLS (fecha o banco / resolve o alerta da Supabase)
-- =====================================================================
-- SO RODE DEPOIS de confirmar que o app ja emite e usa o cracha (JWT) em
-- producao. Com a RLS ligada, requisicoes SEM cracha valido (anonimas) sao
-- NEGADAS; as com cracha (usuario logado, role=authenticated) funcionam.
-- O service_role (servidor /api) sempre ignora a RLS.
--
-- Se algo quebrar, rode o rollback: supabase/migrations/003_rollback_rls.sql
--
-- Politica: todo usuario LOGADO tem acesso total (mesmo comportamento de
-- hoje, mas o ANONIMO passa a nao ver nada). Refinamentos (ex: salario so
-- Edson) vem depois, por cima disto.
-- =====================================================================

-- 1) Limpa QUALQUER policy antiga nessas tabelas (evita politicas herdadas
--    do schema antigo que usavam USING(true) e deixariam o anonimo entrar).
do $$
declare
  r record;
  alvo text[] := array[
    'projects','interruptions','issues','innovations','interruption_types',
    'activity_types','operational_activities','project_requests','gantt_tasks',
    'users','settings','audit_logs'
  ];
begin
  for r in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public' and tablename = any(alvo)
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- 2) Liga a RLS e cria a politica "usuario logado tem acesso total" em cada
--    tabela. anon (sem cracha) fica sem policy => negado.
do $$
declare
  t text;
  alvo text[] := array[
    'projects','interruptions','issues','innovations','interruption_types',
    'activity_types','operational_activities','project_requests','gantt_tasks',
    'users','settings','audit_logs'
  ];
begin
  foreach t in array alvo loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "logado_acesso_total" on public.%I for all to authenticated using (true) with check (true)', t
    );
  end loop;
end $$;

-- 3) EXCECAO settings: a TELA DE LOGIN (antes de logar, sem cracha) le
--    logo/nome da empresa. Liberamos SELECT anonimo so em settings (nao tem
--    senha nem salario). O resto continua exigindo login.
create policy "settings_leitura_anon_login" on public.settings
  for select to anon using (true);

notify pgrst, 'reload config';

-- =====================================================================
-- Conferencia:
--   select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in
--   ('projects','users','settings','interruptions','audit_logs')
--   order by tablename;   -- rowsecurity deve ser true
-- =====================================================================
