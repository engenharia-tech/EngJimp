-- =====================================================================
-- 003 ROLLBACK — DESLIGA a RLS (volta ao estado aberto de antes)
-- =====================================================================
-- Use SO se ligar a RLS (003) quebrar o app. Desliga a RLS nas tabelas,
-- voltando ao comportamento anterior (todos leem/escrevem). As politicas
-- criadas ficam (inertes com RLS off) — nao atrapalham.
-- =====================================================================
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
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;

notify pgrst, 'reload config';
