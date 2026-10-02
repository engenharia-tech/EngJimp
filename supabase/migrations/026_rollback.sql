-- 026_rollback — volta o KPI dos setores ao estado da 025 (01/10/2026).
-- Desfaz: as fontes projetos/paradas/inovações, o escopo 'engenharia', a média e o % no estimado, a trava de 16 h,
-- e o P&D reservado (volta a valer: quem vê todos os setores vê o P&D).
-- RECUSA se houver indicador usando o que só existe na 026 (apague ou passe para manual antes): nada é apagado aqui.
-- Rodar inteiro no SQL Editor. Tudo numa transação.

begin;
set local search_path = public, extensions;

do $$ begin
  if to_regprocedure('public.kpis_vejo_setor(text)') is null then
    raise exception 'KPIS 026_rollback: a 026 não está instalada. Nada foi mudado.';
  end if;
  if exists (select 1 from public.kpis_indicador where tipo = 'calculado'
              and (coalesce(calc_fonte, 'atividades') <> 'atividades' or calc_escopo not in ('setor', 'todos')
                   or calc_medida not in ('horas', 'quantidade'))) then
    raise exception 'KPIS 026_rollback: há indicador calculado por projetos, paradas, inovações ou escopo engenharia. Apague-os (ou passe para manual) antes. Nada foi mudado.';
  end if;
end $$;

-- 1) as políticas do indicador voltam às da 025 (ler: a da 023); apagar lançamento volta à da 023
drop policy if exists kpis_indicador_ler    on public.kpis_indicador;
drop policy if exists kpis_indicador_criar  on public.kpis_indicador;
drop policy if exists kpis_indicador_editar on public.kpis_indicador;
drop policy if exists kpis_indicador_apagar on public.kpis_indicador;
create policy kpis_indicador_ler    on public.kpis_indicador for select to authenticated
  using ((select public.kpis_ve_todos()) or public.kpis_setor_chave(setor) = (select public.kpis_meu_setor()));
create policy kpis_indicador_criar  on public.kpis_indicador for insert to authenticated
  with check (public.kpis_posso_criar(setor));
create policy kpis_indicador_editar on public.kpis_indicador for update to authenticated
  using ((select public.kpis_administra())
         or (do_setor and public.kpis_setor_chave(setor) = (select public.kpis_meu_setor())))
  with check ((select public.kpis_administra())
         or (do_setor and public.kpis_setor_chave(setor) = (select public.kpis_meu_setor())));
create policy kpis_indicador_apagar on public.kpis_indicador for delete to authenticated
  using ((select public.kpis_administra())
         or (do_setor and public.kpis_setor_chave(setor) = (select public.kpis_meu_setor())));
drop policy if exists kpis_lancamento_apagar on public.kpis_lancamento;
create policy kpis_lancamento_apagar on public.kpis_lancamento for delete to authenticated using ((select public.kpis_administra()));

-- 2) as funções voltam ao texto da 023/025
create or replace function public.kpis_vejo_indicador(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i
                  where i.id = p_indicador
                    and (public.kpis_ve_todos() or public.kpis_setor_chave(i.setor) = public.kpis_meu_setor()))
$f$;
create or replace function public.kpis_posso_lancar(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i
                  where i.id = p_indicador and i.ativo and i.tipo = 'manual'
                    and (public.kpis_setor_chave(i.setor) = public.kpis_meu_setor() or public.kpis_administra()))
$f$;
create or replace function public.kpis_dono_ve(p_dono text, p_setor text) returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce((select case
      when u.id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid then true
      when u.desligado_em is not null and u.desligado_em < public.kpis_hoje() then false   -- desligado (022): o link dele para
      when coalesce(u.okr_admin, false) then true
      when coalesce(u.okr_viewer, false) or coalesce(u.role, '') = 'ADM_EXTERNO' then false
      when coalesce(u.role, '') = 'CEO' then true
      else public.kpis_setor_chave(u.sector) = public.kpis_setor_chave(p_setor) end
    from public.users u where lower(btrim(u.username)) = lower(btrim(p_dono)) limit 1), false)
$f$;
create or replace function public.kpis_setores()
returns table (chave text, nome text, pessoas integer, grafias text[])
language sql stable security definer set search_path = public as $f$
  with g as (
    select public.kpis_setor_chave(u.sector) as ch, btrim(u.sector) as gr, count(*)::int as n
      from public.users u
     where public.kpis_ve_todos()
       and public.kpis_setor_chave(u.sector) is not null
       and (u.desligado_em is null or u.desligado_em >= public.kpis_hoje())
       and not ((coalesce(u.okr_viewer, false) or coalesce(u.role, '') = 'ADM_EXTERNO') and not coalesce(u.okr_admin, false))
       and lower(coalesce(u.username, '')) not like 'zz\_%'
     group by 1, 2)
  select ch, (array_agg(gr order by n desc, gr))[1], sum(n)::int, array_agg(gr order by n desc, gr) from g group by ch order by 2
$f$;
create or replace function public.kpis_calc_interno(p_indicador uuid, p_de date, p_ate date)
returns table (periodo date, valor numeric, atividades integer)
language sql stable security definer set search_path = public as $f$
  with i as (
    select k.* from public.kpis_indicador k where k.id = p_indicador and k.tipo = 'calculado'),
  lim as (
    select i.frequencia as freq,
           public.kpis_inicio_periodo(i.frequencia, greatest(coalesce(p_de, i.inicio), i.inicio)) as ini,
           public.kpis_inicio_periodo(i.frequencia, least(coalesce(p_ate, public.kpis_hoje()), public.kpis_hoje())) as fim
      from i),
  per as (
    select p::date as periodo
      from lim, generate_series(lim.ini, lim.fim,
             case lim.freq when 'semanal' then interval '7 days' when 'mensal' then interval '1 month' else interval '3 months' end) p
     where lim.ini <= lim.fim
     order by p desc limit 800),   -- os 800 MAIS RECENTES (a saída é ordenada no fim)
  pessoas as (
    select u.id from public.users u, i
     where i.calc_escopo = 'todos' or public.kpis_setor_chave(u.sector) = public.kpis_setor_chave(i.setor)),
  ativ as (
    select public.kpis_inicio_periodo(i.frequencia, (a.start_time at time zone 'America/Sao_Paulo')::date) as periodo,
           greatest(0, coalesce(nullif(a.duration_seconds, 0), extract(epoch from (a.end_time - a.start_time))::int, 0)) as seg
      from i, lim, public.operational_activities a
     where a.user_id in (select id from pessoas)
       and a.activity_type_id = any (i.calc_tipos)
       and a.end_time is not null
       and a.start_time >= (lim.ini::timestamp at time zone 'America/Sao_Paulo')
       and a.start_time <  (public.kpis_proximo_periodo(lim.freq, lim.fim)::timestamp at time zone 'America/Sao_Paulo'))
  select per.periodo,
         round(coalesce(sum(case when a.seg is null then 0                       -- período sem atividade = 0
                                 when (select calc_medida from i) = 'horas' then a.seg / 3600.0
                                 else 1 end), 0)::numeric, 4),
         count(a.seg)::int
    from per left join ativ a on a.periodo = per.periodo
   group by per.periodo
   order by per.periodo
$f$;
create or replace function public.kpis_valores_ligados(p_pedidos jsonb)
returns table (dono text, indicador_id uuid, de text, ate text, valor numeric, periodo date, periodos integer,
               nome text, unidade text, casas smallint, consolidacao text, arquivado boolean, tipo text, frequencia text)
language plpgsql stable security definer set search_path = public as $f$
#variable_conflict use_column
declare
  v_servidor boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
  v_minha text; v_le_todos boolean := false;
begin
  if jsonb_typeof(p_pedidos) is distinct from 'array' or jsonb_array_length(p_pedidos) > 500 then
    raise exception 'KPIS_PEDIDOS_INVALIDOS' using errcode = 'P0001'; end if;
  if not v_servidor then
    if not public.kpis_cadastrado() then return; end if;
    v_minha := public.okr_my_key();
    v_le_todos := coalesce(public.okr_is_master(), false) or coalesce(public.okr_is_ceo(), false) or coalesce(public.okr_is_viewer(), false);
  end if;
  return query
  with ped as (
    select distinct lower(btrim(e->>'dono')) as p_dono, (e->>'id')::uuid as p_id,
           coalesce(e->>'de', '') as p_de, coalesce(e->>'ate', '') as p_ate
      from jsonb_array_elements(p_pedidos) e
     where jsonb_typeof(e) = 'object'
       and coalesce(e->>'id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       and btrim(coalesce(e->>'dono', '')) <> ''),
  ok as (
    select p.*, i.id as i_id, i.nome as i_nome, i.unidade as i_uni, i.casas as i_casas, i.frequencia as i_freq,
           i.consolidacao as i_con, not i.ativo as i_arq, i.tipo as i_tipo,
           (not v_servidor and public.kpis_vejo_indicador(i.id)) as i_ve,
           public.kpis_data_ou_nulo(p.p_de) as d_de, public.kpis_data_ou_nulo(p.p_ate) as d_ate
      from ped p join public.kpis_indicador i on i.id = p.p_id
     where (v_servidor or v_le_todos or p.p_dono = v_minha)                           -- (1)
       and public.kpis_dono_ve(p.p_dono, i.setor)                                     -- (3)
       and exists (select 1 from public.okr_state s,                                  -- (2)
                          jsonb_path_query(s.data, 'lax $.** ? (@.kpiId == $id)', jsonb_build_object('id', i.id::text)) kr
                    where s.owner_key = p.p_dono
                      and (v_servidor or public.kpis_vejo_indicador(i.id)
                           or (coalesce(kr->>'start', '') = p.p_de and coalesce(kr->>'due', '') = p.p_ate)))),
  serie as (   -- manual: os lançamentos; calculado: a série das atividades (até hoje)
    select o.p_dono, o.i_id, o.p_de, o.p_ate, l.periodo as per, l.valor as val
      from ok o join public.kpis_lancamento l on l.indicador_id = o.i_id
     where o.i_tipo = 'manual'
    union all
    select o.p_dono, o.i_id, o.p_de, o.p_ate, c.periodo, c.valor
      from ok o, lateral public.kpis_calc_interno(o.i_id,
               coalesce(o.d_de, (public.kpis_hoje() - interval '3 years')::date),
               coalesce(o.d_ate, public.kpis_hoje())) c
     where o.i_tipo = 'calculado'),
  janela as (
    select s.* from serie s join ok o on o.p_dono = s.p_dono and o.i_id = s.i_id and o.p_de = s.p_de and o.p_ate = s.p_ate
     where (o.d_ate is null or s.per <= o.d_ate)
       and (o.d_de is null or s.per >= public.kpis_inicio_periodo(o.i_freq, o.d_de))
       and (o.i_con <> 'soma' or (o.d_de is not null and o.d_ate is not null))
       -- calculado + 'ultimo': o período em curso ainda está acontecendo (no dia 1º vale 0) — vale o
       -- último período FECHADO. 'soma' segue somando até hoje (é um acumulado).
       and (o.i_tipo <> 'calculado' or o.i_con = 'soma' or s.per < public.kpis_inicio_periodo(o.i_freq, public.kpis_hoje())))
  select o.p_dono, o.i_id, o.p_de, o.p_ate,
         case when o.i_con = 'soma' then (select sum(j.val) from janela j where j.p_dono = o.p_dono and j.i_id = o.i_id and j.p_de = o.p_de and j.p_ate = o.p_ate)
              else (select j.val from janela j where j.p_dono = o.p_dono and j.i_id = o.i_id and j.p_de = o.p_de and j.p_ate = o.p_ate
                     order by j.per desc limit 1) end,
         (select max(j.per) from janela j where j.p_dono = o.p_dono and j.i_id = o.i_id and j.p_de = o.p_de and j.p_ate = o.p_ate),
         (select count(*)::int from janela j where j.p_dono = o.p_dono and j.i_id = o.i_id and j.p_de = o.p_de and j.p_ate = o.p_ate),
         case when o.i_ve or v_servidor then o.i_nome end, case when o.i_ve or v_servidor then o.i_uni end, o.i_casas, o.i_con, o.i_arq, o.i_tipo, o.i_freq
    from ok o;
end $f$;
create or replace function public.kpis_posso_criar(p_setor text) returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce(public.kpis_administra(), false)
      or (public.kpis_meu_setor() is not null and public.kpis_setor_chave(p_setor) = public.kpis_meu_setor())
$f$;
create or replace function public.kpis_gerencio_indicador(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i
                  where i.id = p_indicador
                    and (public.kpis_administra()
                         or (i.do_setor and public.kpis_meu_setor() is not null
                             and public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())))
$f$;
create or replace function public.kpis_indicador_antes() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid(); new.criado_em := clock_timestamp();
    new.do_setor := not coalesce(public.kpis_administra(), false);
  else
    new.id := old.id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    new.do_setor := old.do_setor;
    if (new.frequencia is distinct from old.frequencia or new.tipo is distinct from old.tipo)
       and exists (select 1 from public.kpis_lancamento l where l.indicador_id = old.id) then
      raise exception 'KPIS_FREQUENCIA_TRAVADA: este indicador já tem lançamentos; para mudar a frequência ou o tipo, crie outro.' using errcode = 'P0001';
    end if;
  end if;
  new.setor := btrim(regexp_replace(new.setor, '\s+', ' ', 'g'));
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.unidade := btrim(coalesce(new.unidade, ''));
  new.descricao := nullif(btrim(new.descricao), '');
  if new.tipo = 'manual' then new.calc_tipos := null; new.calc_medida := null; new.calc_escopo := null; end if;
  -- 025: o calculado criado pelo setor conta só as pessoas do setor (nenhum setor soma as horas dos outros)
  if new.do_setor and new.tipo = 'calculado' and coalesce(new.calc_escopo, '') <> 'setor' then
    raise exception 'KPIS_ESCOPO_SETOR: o indicador calculado do setor conta só as atividades das pessoas do setor.' using errcode = 'P0001';
  end if;
  new.inicio := public.kpis_inicio_periodo(new.frequencia, coalesce(new.inicio, public.kpis_hoje()));
  if tg_op = 'UPDATE' and exists (select 1 from public.kpis_lancamento l where l.indicador_id = old.id and l.periodo < new.inicio) then
    raise exception 'KPIS_INICIO_DEPOIS_DE_LANCAMENTO: há lançamento antes do novo início.' using errcode = 'P0001';
  end if;
  new.atualizado_por := auth.uid(); new.atualizado_em := clock_timestamp();
  return new;
end $f$;
create or replace function public.kpis_meu_acesso()
returns table (cadastrado boolean, visualizador boolean, ve_todos boolean, administra boolean,
               setor_chave text, setor_nome text, indicadores integer, posso_lancar integer, cria boolean)
language sql stable security definer set search_path = public as $f$
  select public.kpis_cadastrado(), public.kpis_visualizador(), public.kpis_ve_todos(), public.kpis_administra(),
         public.kpis_meu_setor(),
         (select nullif(btrim(u.sector), '') from public.users u where u.id = auth.uid()
             and public.kpis_cadastrado() and not public.kpis_visualizador()),
         (select count(*)::int from public.kpis_indicador i where i.ativo
             and (public.kpis_ve_todos() or public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())),
         (select count(*)::int from public.kpis_indicador i where i.ativo and i.tipo = 'manual'
             and (public.kpis_administra() or public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())),
         coalesce(public.kpis_administra(), false) or public.kpis_meu_setor() is not null
$f$;

-- 3) as funções novas saem (nada mais as usa)
drop function if exists public.kpis_gerencio(text, boolean);
drop function if exists public.kpis_vejo_setor(text);
drop function if exists public.kpis_ve_reservado();
drop function if exists public.kpis_setor_reservado(text);
drop function if exists public.kpis_corte_ped();
drop function if exists public.kpis_maiusculo(text);

-- 4) a regra do calculado volta à da 023 e as colunas novas saem (calc_fonte, calc_filtro, versao_tela)
alter table public.kpis_indicador drop constraint if exists kpis_ind_tipo;
alter table public.kpis_indicador drop column if exists calc_filtro;
alter table public.kpis_indicador drop column if exists calc_fonte;
alter table public.kpis_indicador drop column if exists versao_tela;
alter table public.kpis_indicador add constraint kpis_ind_tipo check (
    (tipo = 'manual' and calc_tipos is null and calc_medida is null and calc_escopo is null)
    or (tipo = 'calculado' and cardinality(calc_tipos) between 1 and 40
        and calc_medida in ('horas', 'quantidade') and calc_escopo in ('setor', 'todos')));

do $$ begin
  if to_regprocedure('public.kpis_vejo_setor(text)') is not null
     or exists (select 1 from information_schema.columns where table_name = 'kpis_indicador' and column_name in ('calc_fonte', 'calc_filtro', 'versao_tela'))
     or (select count(*) from pg_policies where tablename like 'kpis\_%') <> 13
     or exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and has_function_privilege('anon', p.oid, 'EXECUTE')) then
    raise exception 'KPIS 026_rollback: o desfazer não fechou. Nada foi mudado.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: false · false · 13 · 0
select to_regprocedure('public.kpis_vejo_setor(text)') is not null                                           as tem_026,
       exists (select 1 from information_schema.columns where table_name = 'kpis_indicador' and column_name = 'calc_fonte') as tem_fonte,
       (select count(*) from pg_policies where tablename like 'kpis\_%')                                     as politicas,
       (select count(*) from pg_proc where proname like 'kpis\_%' and has_function_privilege('anon', oid, 'EXECUTE')) as anonimo_executa;
