-- =====================================================================================================
-- 029_rollback — desfaz a 029 (05/10/2026).
-- 🔴 SÓ POR DECISÃO DO EDSON: isto REABRE o custo — o navegador e o anônimo voltam a ler projects e settings
--    INTEIRAS (total_cost, hourly_cost…), o navegador volta a gravar as colunas de custo, e o "Somente OKR" volta
--    a ler e gravar as tabelas da engenharia pela API. Não é arquivo para "rodar de novo para garantir".
-- O código que lê por lista de colunas e pega os R$ no servidor continua funcionando depois disto (não precisa
-- voltar o código junto). Nada é apagado aqui: só políticas, a função e privilégios.
-- Rodar inteiro no SQL Editor. Tudo numa transação (se o editor disser "current transaction is aborted", rodar
-- `rollback;` sozinho e colar de novo).
-- =====================================================================================================

begin;
set local search_path = public, extensions;
set local lock_timeout = '5s';

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'operational_activities', 'interruptions', 'innovations', 'gantt_tasks',
                           'project_requests', 'issues'] loop
    execute format('drop policy if exists somente_okr_sem_engenharia on public.%I', t);
  end loop;
  foreach t in array array['activity_types', 'interruption_types'] loop
    execute format('drop policy if exists somente_okr_nao_grava_ins on public.%I', t);
    execute format('drop policy if exists somente_okr_nao_grava_upd on public.%I', t);
    execute format('drop policy if exists somente_okr_nao_grava_del on public.%I', t);
  end loop;
end $$;

drop function if exists public.e_somente_okr();

-- os privilégios voltam a ser da tabela inteira (o revoke de tabela tira também os grants de coluna da 029)
revoke select on table public.projects from authenticated, anon;
revoke insert, update on table public.projects from authenticated, anon;
grant select on table public.projects to authenticated, anon;
grant insert, update on table public.projects to authenticated, anon;
revoke select on table public.settings from authenticated, anon;
grant select on table public.settings to authenticated, anon;

do $$ begin
  if exists (select 1 from pg_policies where schemaname = 'public'
               and policyname in ('somente_okr_sem_engenharia', 'somente_okr_nao_grava_ins',
                                  'somente_okr_nao_grava_upd', 'somente_okr_nao_grava_del'))
     or to_regprocedure('public.e_somente_okr()') is not null
     or not has_table_privilege('authenticated', 'public.projects', 'SELECT')
     or not has_table_privilege('anon', 'public.projects', 'SELECT')
     or not has_table_privilege('authenticated', 'public.projects', 'INSERT')
     or not has_table_privilege('authenticated', 'public.projects', 'UPDATE')
     or not has_table_privilege('anon', 'public.projects', 'INSERT')
     or not has_table_privilege('anon', 'public.projects', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.settings', 'SELECT')
     or not has_table_privilege('anon', 'public.settings', 'SELECT') then
    raise exception 'KPI 029_rollback: não voltou ao estado de antes. Nada foi mudado — chame o Claude.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: false · 0 · true · true
select
  to_regprocedure('public.e_somente_okr()') is not null                                                as tem_funcao,
  (select count(*) from pg_policies where schemaname = 'public'
     and policyname in ('somente_okr_sem_engenharia', 'somente_okr_nao_grava_ins',
                        'somente_okr_nao_grava_upd', 'somente_okr_nao_grava_del'))                          as politicas,
  has_column_privilege('authenticated', 'public.projects', 'total_cost', 'SELECT')                     as navegador_le_custo_projeto,
  has_column_privilege('authenticated', 'public.settings', 'hourly_cost', 'SELECT')                    as navegador_le_custo_hora;
