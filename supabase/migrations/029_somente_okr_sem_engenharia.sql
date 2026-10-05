-- =====================================================================================================
-- 029 — "SOMENTE OKR" FORA DAS TABELAS DA ENGENHARIA + R$ DOS PROJETOS E DO CUSTO/HORA SÓ PELO SERVIDOR
--       (05/10/2026)
--
-- Achado de 02/10 (pré-existente; medido de novo em 05/10 com pg_policies e has_column_privilege):
--   · nas tabelas da engenharia (projects, operational_activities, interruptions, innovations, gantt_tasks,
--     project_requests, issues) a política PERMISSIVE "usuario_real" é ALL com auth.uid() IS NOT NULL, e as
--     RESTRICTIVE só barram o visualizador (okr_is_viewer) e quem não é cadastrado. Quem é "Somente OKR"
--     (users.okr_only: 8 pessoas em 05/10, mais o Luiz Henrique da TI quando tiver login) LIA E GRAVAVA tudo
--     isso pela API, com o próprio crachá — inclusive as atividades do P&D (setor reservado) —, e criava,
--     mudava e apagava tipos de atividade e de parada (activity_types, interruption_types). A tela só
--     escondia as abas (App.tsx, isOkrOnly).
--   · todo logado lia (e gravava) projects.total_cost / productive_cost / interruption_cost e lia
--     settings.hourly_cost — custo ÷ horas devolve a taxa (decisão do Edson, 30/09: R$ só para ele e os CEOs).
-- Medido na tela (05/10): o "Somente OKR" só abre OKR, Agenda e KPI dos setores, e nenhuma das três precisa
--   dessas tabelas: o OKR só usa projetos/atividades no painel do Edson (showActivity); a Agenda mostra só
--   as atividades da PRÓPRIA pessoa (os 8 têm 0); o KPI dos setores calcula no banco (kpis_calc_interno e
--   kpis_tipos_atividade, SECURITY DEFINER do dono das tabelas — a RLS não vale para elas). Nenhum dos 8
--   gravou nas tabelas da engenharia desde que virou "Somente OKR" (auditoria).
--   As colunas de custo: a tela não as usa mais para mostrar R$ (desde 30/09 o R$ sai da série, só para
--   Edson/CEO); sobram a exportação de jan–ago (o custo gravado na época) e o valor manual do custo/hora —
--   os dois passam a vir do servidor (/api/projects/custo-gravado e /api/labor/hourly-cost, só para quem vê
--   R$), no código que sobe ANTES.
-- Agora:
--   A) public.e_somente_okr() (SECURITY DEFINER, lê o cadastro na hora: tirar a marca vale na hora; o Edson,
--      pelo id, nunca) e políticas RESTRICTIVE:
--        · somente_okr_sem_engenharia (ALL) nas 7 tabelas da engenharia: nem ler, nem gravar;
--        · somente_okr_nao_grava_ins/upd/del em activity_types e interruption_types: ler continua (a carga
--          semeia e repete quando a lista de tipos volta vazia; os nomes não são segredo), gravar não;
--        · settings fica como está para o "Somente OKR": a moldura do app usa o bloqueio automático, o
--          horário e a logo; gravar já era só pelo servidor (não há política de escrita).
--   B) o navegador (authenticated) e o anônimo deixam de LER projects.total_cost, productive_cost,
--      interruption_cost e settings.hourly_cost, e o navegador deixa de GRAVAR as três de projects (o banco
--      põe 0 em projeto novo); o anônimo perde INSERT/UPDATE em projects (nunca gravou: não há política para
--      ele). O privilégio da TABELA sai e volta COLUNA A COLUNA, por uma lista FECHADA escrita aqui: se a tabela
--      tiver coluna fora da lista (coluna nova) ou faltar uma da lista, a migração PARA — ninguém libera coluna
--      nova sem olhar.
--      🔴 Coluna NOVA em projects ou settings NÃO chega ao navegador até alguém dar o grant de coluna (como
--      em users). E select('*') nessas duas tabelas passa a dar 42501.
--   C) antes de terminar, a migração PROVA o que fez, como as pessoas reais: um "Somente OKR" do cadastro
--      não vê projetos nem atividades e vê os tipos; um projetista vê tudo e não lê custo; o Edson vê tudo.
-- Não muda: quem não é "Somente OKR" (projetistas, coordenador, PROCESSOS sem a marca, CEO, Edson) lê e
--   grava como antes (fora as colunas de custo); o visualizador; o servidor (service_role) e o motor do KPI.
--
-- 🔴 ORDEM: o CÓDIGO que lê projects/settings por lista de colunas, não grava as colunas de custo e pega os R$
--   no servidor tem de estar NO AR antes desta migração. Aba com o pacote de ANTES, depois dela: os projetos
--   somem (pede select('*')) e CRIAR projeto falha (manda as colunas de custo com 0) — até Ctrl+Shift+R. Antes
--   de colar, conferir nos registros do Supabase que ninguém mais pede `projects?select=*` (a assinatura do
--   pacote antigo). Rodar fora do expediente.
-- Rodar inteiro no SQL Editor. Tudo numa transação: se uma trava disparar, NADA fica (se o editor disser depois
-- "current transaction is aborted", rodar `rollback;` sozinho e colar de novo). Se alguma tabela estiver presa
-- por mais de 5 s, para sem esperar (lock_timeout) — é só rodar de novo depois.
-- Pode rodar de novo. Desfazer: 029_rollback.sql (reabre o custo — só por decisão do Edson).
-- =====================================================================================================

begin;
set local search_path = public, extensions;
set local lock_timeout = '5s';

-- 0) TRAVAS ANTES DE MEXER -----------------------------------------------------------------------------------------
do $$
declare
  dependentes text;
begin
  if to_regprocedure('public.okr_is_viewer()') is null or to_regprocedure('public.usuario_cadastrado()') is null then
    raise exception 'KPI 029: faltam okr_is_viewer()/usuario_cadastrado() — este não é o banco do KPI. Nada foi mudado.';
  end if;
  -- Função que roda com os privilégios de quem chama (não SECURITY DEFINER) — executável pelo navegador/anônimo,
  -- ou função de GATILHO (roda com os privilégios de quem grava, sem pedir EXECUTE) — e cita projects ou settings
  -- quebraria com a parte B (select *, row_to_json, setof, gravar custo…). Na dúvida, para.
  select string_agg(p.oid::regprocedure::text, ', ') into dependentes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and not p.prosecdef
     and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')
          or exists (select 1 from pg_trigger t where t.tgfoid = p.oid and not t.tgisinternal))
     and pg_get_functiondef(p.oid) ~* '\m(projects|settings|total_cost|productive_cost|interruption_cost|hourly_cost)\M';
  if dependentes is not null then
    raise exception 'KPI 029: estas funções usam projects/settings com os privilégios de quem chama: %. Nada foi mudado — chame o Claude.', dependentes;
  end if;
  -- View sobre projects/settings roda com os privilégios do dono e furaria a parte B.
  select string_agg(c.relname, ', ') into dependentes
    from pg_depend d join pg_rewrite w on w.oid = d.objid join pg_class c on c.oid = w.ev_class
   where d.classid = 'pg_rewrite'::regclass and d.refobjid in ('public.projects'::regclass, 'public.settings'::regclass)
     and c.oid not in ('public.projects'::regclass, 'public.settings'::regclass);
  if dependentes is not null then
    raise exception 'KPI 029: há view(s) sobre projects/settings: %. Nada foi mudado — chame o Claude.', dependentes;
  end if;
  -- Política de OUTRA tabela que consulta projects/settings roda com os privilégios de quem lê aquela tabela.
  select string_agg(schemaname || '.' || tablename || '/' || policyname, ', ') into dependentes
    from pg_policies
   where tablename not in ('projects', 'settings')
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~* '\m(projects|settings)\M';
  if dependentes is not null then
    raise exception 'KPI 029: há política(s) de outras tabelas que consultam projects/settings: %. Nada foi mudado — chame o Claude.', dependentes;
  end if;
end $$;

-- A) "SOMENTE OKR" FORA DA ENGENHARIA --------------------------------------------------------------------------------
create or replace function public.e_somente_okr() returns boolean
language sql stable security definer set search_path = public as $f$
  -- 029: quem é "Somente OKR" (users.okr_only), lido do CADASTRO na hora (nunca do crachá). O Edson nunca.
  select coalesce(auth.uid() <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid, false)
     and exists (select 1 from public.users u where u.id = auth.uid() and u.okr_only is true)
$f$;
revoke all on function public.e_somente_okr() from public, anon;
grant execute on function public.e_somente_okr() to authenticated, service_role;  -- usada DENTRO das políticas

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'operational_activities', 'interruptions', 'innovations', 'gantt_tasks',
                           'project_requests', 'issues'] loop
    execute format('drop policy if exists somente_okr_sem_engenharia on public.%I', t);
    execute format('create policy somente_okr_sem_engenharia on public.%I as restrictive for all to authenticated '
                   'using (not (select public.e_somente_okr())) with check (not (select public.e_somente_okr()))', t);
  end loop;
  foreach t in array array['activity_types', 'interruption_types'] loop
    execute format('drop policy if exists somente_okr_nao_grava_ins on public.%I', t);
    execute format('drop policy if exists somente_okr_nao_grava_upd on public.%I', t);
    execute format('drop policy if exists somente_okr_nao_grava_del on public.%I', t);
    execute format('create policy somente_okr_nao_grava_ins on public.%I as restrictive for insert to authenticated '
                   'with check (not (select public.e_somente_okr()))', t);
    execute format('create policy somente_okr_nao_grava_upd on public.%I as restrictive for update to authenticated '
                   'using (not (select public.e_somente_okr())) with check (not (select public.e_somente_okr()))', t);
    execute format('create policy somente_okr_nao_grava_del on public.%I as restrictive for delete to authenticated '
                   'using (not (select public.e_somente_okr()))', t);
  end loop;
end $$;

-- B) R$ SÓ PELO SERVIDOR: projects e settings coluna a coluna, por uma lista FECHADA ----------------------------------
do $$
declare
  -- o que o navegador lê (e, em projects, grava): TODAS as colunas de hoje menos as de custo
  proj_liberadas constant text[] := array['id', 'ns', 'project_code', 'type', 'implement_type', 'start_time', 'end_time',
    'total_active_seconds', 'pauses', 'status', 'notes', 'user_id', 'created_at', 'client_name', 'flooring_type',
    'variations', 'estimated_seconds', 'is_overtime', 'interruption_seconds', 'total_seconds', 'updated_at', 'chassis_number'];
  proj_custo constant text[] := array['total_cost', 'productive_cost', 'interruption_cost'];
  sett_liberadas constant text[] := array['id', 'use_automatic_cost', 'company_name', 'email_to', 'interruption_email_to',
    'interruption_email_template', 'workday_start', 'workday_end', 'workdays', 'lunch_start', 'lunch_end', 'language',
    'tenant_id', 'created_at', 'updated_at', 'completion_email_template', 'logo_url', 'auto_lock_timeout', 'email_from',
    'nexus_hidden_users'];
  sett_custo constant text[] := array['hourly_cost'];
  fora text; falta text; cols text;
begin
  -- a lista tem de bater com a tabela: coluna nova (fora da lista) ou coluna que sumiu = para
  select string_agg(table_name || '.' || column_name, ', ') into fora
    from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'projects' and column_name <> all (proj_liberadas || proj_custo))
       or (table_name = 'settings' and column_name <> all (sett_liberadas || sett_custo)));
  if fora is not null then
    raise exception 'KPI 029: projects/settings têm coluna(s) que esta migração não conhece: %. Nada foi mudado — chame o Claude (decidir se o navegador pode ler).', fora;
  end if;
  select string_agg(x, ', ') into falta from (
    select 'projects.' || c as x from unnest(proj_liberadas || proj_custo) c
     where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'projects' and column_name = c)
    union all
    select 'settings.' || c from unnest(sett_liberadas || sett_custo) c
     where not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'settings' and column_name = c)) q;
  if falta is not null then
    raise exception 'KPI 029: faltam colunas em projects/settings: %. Nada foi mudado — chame o Claude.', falta;
  end if;

  -- projects: LER (navegador e anônimo) e, para o navegador, INSERIR e ALTERAR — só as liberadas
  select string_agg(quote_ident(c), ', ') into cols from unnest(proj_liberadas) c;
  revoke select on table public.projects from authenticated, anon;          -- tira também os grants de coluna
  revoke insert, update on table public.projects from authenticated, anon;  -- o anônimo não grava nada (sem política)
  execute format('grant select (%s) on table public.projects to authenticated, anon', cols);
  execute format('grant insert (%s), update (%s) on table public.projects to authenticated', cols, cols);

  -- settings: LER (navegador e anônimo) — só as liberadas. Gravar settings já era só pelo servidor (RLS).
  select string_agg(quote_ident(c), ', ') into cols from unnest(sett_liberadas) c;
  revoke select on table public.settings from authenticated, anon;
  execute format('grant select (%s) on table public.settings to authenticated, anon', cols);
end $$;

-- C) CONFERE O RESULTADO — a estrutura e o COMPORTAMENTO, como pessoas reais; senão a migração inteira é desfeita
do $$
declare
  t text;
  falta text := '';
  r text;
  n bigint; tot_proj bigint; tot_tipos bigint; b boolean;
  so_okr uuid; eng uuid;
  edson constant uuid := '1e570c78-7278-4e8d-a90e-a820c11bb07a';
begin
  -- estrutura: a função
  if not exists (select 1 from pg_proc where oid = 'public.e_somente_okr()'::regprocedure and prosecdef)
     or has_function_privilege('anon', 'public.e_somente_okr()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.e_somente_okr()', 'EXECUTE') then
    falta := falta || ' função;';
  end if;
  -- estrutura: as políticas, restritivas e usando a função
  foreach t in array array['projects', 'operational_activities', 'interruptions', 'innovations', 'gantt_tasks',
                           'project_requests', 'issues'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                     and policyname = 'somente_okr_sem_engenharia' and permissive = 'RESTRICTIVE' and cmd = 'ALL'
                     and qual ~ 'e_somente_okr' and with_check ~ 'e_somente_okr') then
      falta := falta || ' política de ' || t || ';';
    end if;
  end loop;
  foreach t in array array['activity_types', 'interruption_types'] loop
    if (select count(*) from pg_policies where schemaname = 'public' and tablename = t and permissive = 'RESTRICTIVE'
          and policyname in ('somente_okr_nao_grava_ins', 'somente_okr_nao_grava_upd', 'somente_okr_nao_grava_del')
          and coalesce(qual, with_check) ~ 'e_somente_okr' and coalesce(with_check, qual) ~ 'e_somente_okr') <> 3
       or exists (select 1 from pg_policies where schemaname = 'public' and tablename = t
                    and policyname like 'somente\_okr\_nao\_grava\_%' and cmd in ('SELECT', 'ALL')) then
      falta := falta || ' políticas de ' || t || ';';
    end if;
  end loop;
  -- estrutura: custo fechado para o navegador e o anônimo; o resto aberto como antes
  if exists (select 1 from unnest(array['authenticated', 'anon']) rr, unnest(array['projects.total_cost', 'projects.productive_cost',
                    'projects.interruption_cost', 'settings.hourly_cost']) tc
              where has_column_privilege(rr, 'public.' || split_part(tc, '.', 1), split_part(tc, '.', 2), 'SELECT'))
     or exists (select 1 from unnest(array['total_cost', 'productive_cost', 'interruption_cost']) c, unnest(array['INSERT', 'UPDATE']) p,
                       unnest(array['authenticated', 'anon']) rr
                 where has_column_privilege(rr, 'public.projects', c, p))
     or has_table_privilege('authenticated', 'public.projects', 'SELECT') or has_table_privilege('anon', 'public.projects', 'SELECT')
     or has_table_privilege('authenticated', 'public.settings', 'SELECT') or has_table_privilege('anon', 'public.settings', 'SELECT')
     or has_table_privilege('authenticated', 'public.projects', 'INSERT') or has_table_privilege('authenticated', 'public.projects', 'UPDATE')
     or has_any_column_privilege('anon', 'public.projects', 'INSERT') or has_any_column_privilege('anon', 'public.projects', 'UPDATE') then
    falta := falta || ' o navegador ou o anônimo ainda lê/grava custo;';
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name in ('projects', 'settings')
                and column_name not in ('total_cost', 'productive_cost', 'interruption_cost', 'hourly_cost')
                and not (has_column_privilege('authenticated', format('public.%I', table_name), column_name, 'SELECT')
                     and has_column_privilege('anon', format('public.%I', table_name), column_name, 'SELECT')))
     or exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'projects'
                   and column_name not in ('total_cost', 'productive_cost', 'interruption_cost')
                   and not (has_column_privilege('authenticated', 'public.projects', column_name, 'INSERT')
                        and has_column_privilege('authenticated', 'public.projects', column_name, 'UPDATE')))
     or not has_table_privilege('authenticated', 'public.projects', 'DELETE') then
    falta := falta || ' alguma coluna comum ficou sem leitura/gravação;';
  end if;

  -- COMPORTAMENTO, como as pessoas do cadastro (o mesmo que o PostgREST faz com o crachá)
  select count(*) into tot_proj from public.projects;
  select count(*) into tot_tipos from public.activity_types;
  -- prova que não prova nada (tabela vazia) não vale: precisa haver projetos e tipos para "ver 0" e "ver todos" contarem
  if tot_proj = 0 or tot_tipos = 0 then falta := falta || ' projects/activity_types vazias — a prova não prova;'; end if;
  select id into so_okr from public.users
   where okr_only is true and id <> edson and not coalesce(okr_viewer, false) and coalesce(role, '') <> 'ADM_EXTERNO'
   order by username limit 1;
  if so_okr is null then falta := falta || ' não achei "Somente OKR" no cadastro para conferir;'; end if;
  select id into eng from public.users
   where role in ('PROJETISTA', 'COORDENADOR') and not coalesce(okr_only, false) and not coalesce(okr_viewer, false)
     and (desligado_em is null or desligado_em >= current_date)
   order by username limit 1;
  if so_okr is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', so_okr, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', so_okr::text, true);
    set local role authenticated;
    select public.e_somente_okr() into b;
    if not b then falta := falta || ' e_somente_okr() falso para quem é Somente OKR;'; end if;
    select count(*) into n from public.projects;               if n <> 0 then falta := falta || ' Somente OKR ainda vê projetos;'; end if;
    select count(*) into n from public.operational_activities; if n <> 0 then falta := falta || ' Somente OKR ainda vê atividades;'; end if;
    select count(*) into n from public.activity_types;         if n <> tot_tipos then falta := falta || ' Somente OKR perdeu os tipos;'; end if;
    reset role;
  end if;
  if eng is not null then
    perform set_config('request.jwt.claims', json_build_object('sub', eng, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', eng::text, true);
    set local role authenticated;
    select public.e_somente_okr() into b;
    if b then falta := falta || ' e_somente_okr() verdadeiro para quem é da engenharia;'; end if;
    select count(*) into n from public.projects; if n <> tot_proj then falta := falta || ' a engenharia perdeu projetos;'; end if;
    r := 'lê';
    begin
      perform total_cost from public.projects limit 1;
    exception when insufficient_privilege then r := 'não lê';
    end;
    if r <> 'não lê' then falta := falta || ' a engenharia ainda lê o custo;'; end if;
    reset role;
  else
    falta := falta || ' não achei projetista/coordenador no cadastro para conferir;';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', edson, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', edson::text, true);
  set local role authenticated;
  select count(*) into n from public.projects; if n <> tot_proj then falta := falta || ' o Edson perdeu projetos;'; end if;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  if falta <> '' then
    raise exception 'KPI 029: não ficou como devia:% Nada foi mudado — chame o Claude.', falta;
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: true · 13 · false · false · false · true · 8
--   (o último é quantas pessoas são "Somente OKR" agora: 8 em 05/10; 9 depois do login do Luiz Henrique)
select
  to_regprocedure('public.e_somente_okr()') is not null                                                as tem_funcao,
  (select count(*) from pg_policies where schemaname = 'public'
     and policyname in ('somente_okr_sem_engenharia', 'somente_okr_nao_grava_ins',
                        'somente_okr_nao_grava_upd', 'somente_okr_nao_grava_del'))                          as politicas,
  has_column_privilege('authenticated', 'public.projects', 'total_cost', 'SELECT')
    or has_column_privilege('authenticated', 'public.settings', 'hourly_cost', 'SELECT')                as navegador_le_custo,
  has_column_privilege('authenticated', 'public.projects', 'total_cost', 'UPDATE')
    or has_column_privilege('authenticated', 'public.projects', 'total_cost', 'INSERT')
    or has_column_privilege('anon', 'public.projects', 'total_cost', 'UPDATE')                         as alguem_grava_custo,
  has_column_privilege('anon', 'public.projects', 'total_cost', 'SELECT')
    or has_column_privilege('anon', 'public.settings', 'hourly_cost', 'SELECT')                         as anonimo_le_custo,
  has_column_privilege('authenticated', 'public.projects', 'total_active_seconds', 'SELECT')
    and has_column_privilege('authenticated', 'public.projects', 'total_active_seconds', 'UPDATE')
    and has_column_privilege('authenticated', 'public.settings', 'auto_lock_timeout', 'SELECT')        as navegador_le_e_grava_o_resto,
  (select count(*) from public.users
    where okr_only is true and id <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid)                    as somente_okr_agora;
