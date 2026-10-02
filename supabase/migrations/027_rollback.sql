-- 027_rollback — volta o KPI dos setores ao estado da 026 (02/10/2026).
-- Desfaz: a fonte 'cronograma' (Nexus Flow) do calculado, kpis_dia_texto, kpis_fontes_calculo e o dia da conclusão
-- no cronograma (gantt_tasks.concluido_em e o gatilho que o carimba — os carimbos se perdem).
-- RECUSA se houver indicador calculado pelo cronograma (apague ou passe para manual antes): nada é apagado aqui.
-- Rodar inteiro no SQL Editor. Tudo numa transação.

begin;
set local search_path = public, extensions;

do $$ begin
  if to_regprocedure('public.kpis_fontes_calculo()') is null then
    raise exception 'KPIS 027_rollback: a 027 não está instalada. Nada foi mudado.';
  end if;
  if exists (select 1 from public.kpis_indicador where calc_fonte = 'cronograma') then
    raise exception 'KPIS 027_rollback: há indicador calculado pelo cronograma. Antes, passe-o para manual (update public.kpis_indicador set tipo = ''manual'', versao_tela = 27 where calc_fonte = ''cronograma'';) ou apague-o. Nada foi mudado.';
  end if;
end $$;

-- 1) a regra do calculado volta à da 026
alter table public.kpis_indicador drop constraint if exists kpis_ind_tipo;
alter table public.kpis_indicador add constraint kpis_ind_tipo check (coalesce(
     (tipo = 'manual' and calc_fonte is null and calc_tipos is null and calc_filtro is null
                      and calc_medida is null and calc_escopo is null)
  or (tipo = 'calculado' and calc_escopo in ('setor', 'todos', 'engenharia') and (
          (calc_fonte = 'atividades' and calc_tipos is not null and cardinality(calc_tipos) between 1 and 40
             and calc_filtro is null and calc_medida in ('horas', 'quantidade'))
       or (calc_fonte = 'projetos' and calc_tipos is null and calc_filtro is not null
             and cardinality(calc_filtro) between 1 and 3
             and calc_filtro <@ array['LIBERACAO', 'VARIACAO', 'DESENVOLVIMENTO']::text[]
             and calc_medida in ('horas', 'quantidade', 'media', 'pct_estimado')
             and (calc_medida in ('horas', 'quantidade') or consolidacao = 'ultimo'))
       or (calc_fonte = 'paradas' and calc_tipos is null and calc_filtro is null and calc_medida in ('horas', 'quantidade'))
       or (calc_fonte = 'inovacoes' and calc_tipos is null and calc_medida = 'quantidade'
             and (calc_filtro is null or (cardinality(calc_filtro) between 1 and 4
                  and calc_filtro <@ array['PENDING', 'APPROVED', 'IMPLEMENTED', 'REJECTED']::text[]))))),
  false));

-- 2) o gatilho e o motor voltam ao texto da 026
create or replace function public.kpis_indicador_antes() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid(); new.criado_em := clock_timestamp();
    new.do_setor := not coalesce(public.kpis_administra(), false);
  else
    new.id := old.id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    new.do_setor := old.do_setor;
    -- a tela de antes da 026 não conhece fonte/escopo/medida novos: alterando um indicador que os usa, regravaria
    -- 'setor'/'horas' calada. A tela nova manda versao_tela = 26 em toda alteração.
    if old.tipo = 'calculado' and coalesce(new.versao_tela, 0) < 26
       and (coalesce(old.calc_fonte, 'atividades') <> 'atividades' or old.calc_escopo = 'engenharia'
            or old.calc_medida in ('media', 'pct_estimado')) then
      raise exception 'KPIS_TELA_ANTIGA: esta tela é de antes dos cálculos novos — recarregue a página (Ctrl+Shift+R) e faça de novo.' using errcode = 'P0001';
    end if;
    if (new.frequencia is distinct from old.frequencia or new.tipo is distinct from old.tipo)
       and exists (select 1 from public.kpis_lancamento l where l.indicador_id = old.id) then
      raise exception 'KPIS_FREQUENCIA_TRAVADA: este indicador já tem lançamentos; para mudar a frequência ou o tipo, crie outro.' using errcode = 'P0001';
    end if;
  end if;
  new.versao_tela := null;
  new.setor := btrim(regexp_replace(new.setor, '\s+', ' ', 'g'));
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  new.unidade := btrim(coalesce(new.unidade, ''));
  new.descricao := nullif(btrim(new.descricao), '');
  if new.tipo = 'manual' then
    new.calc_tipos := null; new.calc_medida := null; new.calc_escopo := null; new.calc_fonte := null; new.calc_filtro := null;
  else
    new.calc_fonte := coalesce(nullif(btrim(new.calc_fonte), ''), 'atividades');   -- a tela de antes da 026 não manda a fonte
    if new.calc_fonte = 'atividades' then
      new.calc_filtro := null;
    else
      new.calc_tipos := null;
      new.calc_filtro := (select array_agg(distinct x order by x)
                            from (select public.kpis_maiusculo(f) as x from unnest(new.calc_filtro) f) s where x <> '');
    end if;
  end if;
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
create or replace function public.kpis_calc_interno(p_indicador uuid, p_de date, p_ate date)
returns table (periodo date, valor numeric, atividades integer)
language sql stable security definer set search_path = public as $f$
  with i as (
    select k.*, coalesce(k.calc_fonte, 'atividades') as fonte
      from public.kpis_indicador k where k.id = p_indicador and k.tipo = 'calculado'),
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
  jan as (
    select (lim.ini::timestamp at time zone 'America/Sao_Paulo') as t0,
           (public.kpis_proximo_periodo(lim.freq, lim.fim)::timestamp at time zone 'America/Sao_Paulo') as t1
      from lim),
  reg as (
    select a.user_id as dono, a.start_time as quando,
           greatest(0, coalesce(nullif(a.duration_seconds, 0), extract(epoch from (a.end_time - a.start_time))::int, 0))::numeric as seg,
           false as concluido, false as tem_est, false as no_est
      from i, jan, public.operational_activities a
     where i.fonte = 'atividades'
       and a.activity_type_id = any (i.calc_tipos)
       and a.end_time is not null
       and (i.calc_medida <> 'horas' or a.end_time - a.start_time <= interval '16 hours')
       and a.start_time >= jan.t0 and a.start_time < jan.t1
    union all
    select p.user_id, q.quando, greatest(0, coalesce(p.total_active_seconds, 0))::numeric,
           p.status = 'COMPLETED',
           p.status = 'COMPLETED' and coalesce(p.estimated_seconds, 0) > 0,
           p.status = 'COMPLETED' and coalesce(p.estimated_seconds, 0) > 0
             and coalesce(p.total_active_seconds, 0) <= p.estimated_seconds
      from i cross join jan cross join public.projects p
           cross join lateral (select case when i.calc_medida in ('media', 'pct_estimado') then p.end_time else p.start_time end as quando) q
     where i.fonte = 'projetos'
       and public.kpis_maiusculo(p.type) = any (i.calc_filtro)
       and q.quando >= jan.t0 and q.quando < jan.t1
    union all
    select x.designer_id, x.start_time, greatest(0, coalesce(x.total_time_seconds, 0))::numeric, false, false, false
      from i, jan, public.interruptions x
     where i.fonte = 'paradas'
       and x.start_time >= jan.t0 and x.start_time < jan.t1
    union all
    select v.author_id, v.created_at, 0::numeric, false, false, false
      from i, jan, public.innovations v
     where i.fonte = 'inovacoes'
       and (i.calc_filtro is null or public.kpis_maiusculo(v.status) = any (i.calc_filtro))
       and v.created_at >= jan.t0 and v.created_at < jan.t1),
  conta as (
    select public.kpis_inicio_periodo(i.frequencia, (r.quando at time zone 'America/Sao_Paulo')::date) as periodo,
           r.seg, r.concluido, r.tem_est, r.no_est
      from i, reg r left join public.users u on u.id = r.dono
     where case i.calc_escopo
             when 'todos' then true
             when 'setor' then u.id is not null and public.kpis_setor_chave(u.sector) = public.kpis_setor_chave(i.setor)
             when 'engenharia' then
                   not (u.id is not null and coalesce(u.role, '') = 'PROCESSOS'
                        and u.id <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid)
               and not (u.id is not null
                        and (u.id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid or upper(btrim(coalesce(u.sector, ''))) = 'P&D')
                        and (r.quando at time zone 'America/Sao_Paulo')::date >= public.kpis_corte_ped())
             else false end)
  select per.periodo,
         case m.medida
           when 'horas'        then round(coalesce(sum(c.seg), 0) / 3600.0, 4)
           when 'quantidade'   then count(c.periodo)::numeric
           when 'media'        then round(sum(c.seg) filter (where c.concluido) / 3600.0
                                          / nullif(count(*) filter (where c.concluido), 0), 4)
           when 'pct_estimado' then round(100.0 * count(*) filter (where c.no_est)
                                          / nullif(count(*) filter (where c.tem_est), 0), 4)
         end,
         (case m.medida when 'media'        then count(*) filter (where c.concluido)
                        when 'pct_estimado' then count(*) filter (where c.tem_est)
                        else count(c.periodo) end)::int
    from per cross join (select i.calc_medida as medida from i) m
    left join conta c on c.periodo = per.periodo
   group by per.periodo, m.medida
   order by per.periodo
$f$;
revoke all on function public.kpis_indicador_antes() from public, anon, authenticated;

-- 3) o dia da conclusão sai do cronograma (os carimbos se perdem; o status fica)
drop trigger if exists kpis_gantt_concluido on public.gantt_tasks;
drop function if exists public.kpis_gantt_concluido();
alter table public.gantt_tasks drop column if exists concluido_em;

-- 4) as funções da 027 saem
drop function if exists public.kpis_fontes_calculo();
drop function if exists public.kpis_dia_texto(text);

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: false · 0
select to_regprocedure('public.kpis_fontes_calculo()') is not null as ainda_tem_027,
       (select count(*) from public.kpis_indicador where calc_fonte = 'cronograma') as cronograma;
