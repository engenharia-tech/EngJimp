-- 027 — KPI DOS SETORES: O CRONOGRAMA (NEXUS FLOW) VIRA FONTE DO CALCULADO (02/10/2026).
--
-- Pedido do Edson, 02/10, olhando o P&D: "dentro de P&D ... só tem as horas e não todas as coisas que a gente fez
-- ... você coloca só as horas e as coisas que a gente criou você não contabiliza". Com o levantamento na mão
-- (12 projetos concluídos no Nexus Flow de fev a jun/2026), a decisão dele: "Automático".
-- Agora:
--   · o cronograma passa a guardar o DIA DA CONCLUSÃO: gantt_tasks.concluido_em, carimbado por gatilho quando a
--     tarefa vira 'done' (e limpo quando deixa de ser) — a tela do Nexus Flow não muda (ela nunca manda essa
--     coluna; se mandasse, o gatilho ignora). Os já concluídos recebem a data final do cronograma (o que se sabia);
--   · calc_fonte ganha 'cronograma': os projetos do cronograma CONCLUÍDOS (status 'done'), no mês da conclusão
--     (sem o carimbo, no da data final); só a tarefa principal (a subtarefa não é projeto), nunca a excluída; o
--     'encerrado' (closed) não é concluído e fica fora; data torta = fora (nunca derruba a conta);
--   · só conta (quantidade); de quem: 'todos' (todo projeto) ou 'setor' (projeto com alguém do setor entre os
--     responsáveis — conta uma vez só);
--   · a tela se identifica com versao_tela 27: a tela da 026 (que lê o cronograma como 'atividades') não muda o
--     cálculo de um indicador do cronograma — nela só arquivar, apagar e tirar meta passam; editar (e meta nova)
--     pede a tela nova (Ctrl+Shift+R). No SQL Editor, mudar o cálculo pede versao_tela = 27 no próprio update;
--   · kpis_fontes_calculo(): a tela nova pergunta ao banco se o cronograma existe (sem a 027, não oferece).
-- Nada mais muda: quem vê, quem cria, quem lança, o P&D reservado, a ligação com o OKR — tudo como na 026.
-- NUNCA lê coluna de custo, economia ou salário (a trava da 026 roda de novo no fim).
--
-- Rodar inteiro no SQL Editor, DEPOIS da 026. Tudo numa transação: se algo falhar, nada fica.

begin;
set local search_path = public, extensions;

do $$ begin
  if to_regprocedure('public.kpis_setor_reservado(text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'kpis_indicador' and column_name = 'calc_fonte')
     or to_regclass('public.gantt_tasks') is null then
    raise exception 'KPIS 027: rode a 026 antes (e o cronograma tem de existir). Nada foi criado.';
  end if;
end $$;

-- 1) a regra do calculado ganha o cronograma -----------------------------------------------------------------------
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
                  and calc_filtro <@ array['PENDING', 'APPROVED', 'IMPLEMENTED', 'REJECTED']::text[])))
       or (calc_fonte = 'cronograma' and calc_tipos is null and calc_filtro is null and calc_medida = 'quantidade'
             and calc_escopo in ('setor', 'todos')))),
  false));

-- 2) o dia do cronograma (texto "aaaa-mm-dd") — torto ou vazio = nulo, nunca erro --------------------------------------
create or replace function public.kpis_dia_texto(p text) returns date language plpgsql immutable set search_path = public as $f$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}' then return null; end if;
  return substr(p, 1, 10)::date;
exception when others then return null;
end $f$;

-- 2b) o dia da conclusão no cronograma ---------------------------------------------------------------------------------
-- A carga vem ANTES do gatilho (com ele, a tarefa que já era 'done' manteria o carimbo antigo, nulo).
alter table public.gantt_tasks add column if not exists concluido_em timestamptz;
update public.gantt_tasks set concluido_em = (public.kpis_dia_texto(end_date)::timestamp at time zone 'America/Sao_Paulo')
 where lower(btrim(coalesce(status, ''))) = 'done' and concluido_em is null and public.kpis_dia_texto(end_date) is not null;
-- Quem grava é o gatilho, sempre: virou 'done' = agora; continua 'done' = o carimbo de antes; deixou de ser = nulo.
-- O que o navegador mandar nessa coluna é ignorado.
create or replace function public.kpis_gantt_concluido() returns trigger language plpgsql set search_path = public as $f$
begin
  if lower(btrim(coalesce(new.status, ''))) = 'done' then
    new.concluido_em := case when tg_op = 'UPDATE' and lower(btrim(coalesce(old.status, ''))) = 'done'
                             then old.concluido_em else clock_timestamp() end;
  else
    new.concluido_em := null;
  end if;
  return new;
end $f$;
drop trigger if exists kpis_gantt_concluido on public.gantt_tasks;
create trigger kpis_gantt_concluido before insert or update on public.gantt_tasks
  for each row execute function public.kpis_gantt_concluido();

-- 3) a tela pergunta: o banco já tem o cronograma? ----------------------------------------------------------------------
create or replace function public.kpis_fontes_calculo() returns text[] language sql immutable set search_path = public as $f$
  select array['atividades', 'projetos', 'paradas', 'inovacoes', 'cronograma']::text[]
$f$;

-- 4) o gatilho do indicador (o da 026 + o cronograma) ---------------------------------------------------------------
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
    -- 027: a tela da 026 não conhece o cronograma (lê como 'atividades'): mudar o cálculo de um indicador do
    -- cronograma só a tela nova (versao_tela 27). Arquivar (só 'ativo') passa.
    if old.tipo = 'calculado' and old.calc_fonte = 'cronograma' and coalesce(new.versao_tela, 0) < 27
       and (new.tipo, new.calc_fonte, new.calc_medida, new.calc_escopo, new.calc_tipos, new.calc_filtro)
           is distinct from (old.tipo, old.calc_fonte, old.calc_medida, old.calc_escopo, old.calc_tipos, old.calc_filtro) then
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
    elsif new.calc_fonte = 'cronograma' then   -- 027: o cronograma não tem filtro (conta os concluídos)
      new.calc_tipos := null; new.calc_filtro := null;
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

-- 5) o motor do calculado (o da 026 + o cronograma) — a MESMA assinatura e o mesmo retorno -------------------------
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
       and v.created_at >= jan.t0 and v.created_at < jan.t1
    union all
    -- 027: os projetos do cronograma (Nexus Flow) CONCLUÍDOS, pelo DIA DA CONCLUSÃO (concluido_em, gravado pelo
    -- gatilho; sem ele, a data final do cronograma) — dia de Joinville;
    -- só a tarefa principal (subtarefa não é projeto), nunca a excluída. De quem: 'todos' = todo projeto;
    -- 'setor' = projeto com alguém do setor entre os responsáveis (conta uma vez só).
    select case when i.calc_escopo = 'setor' then
             (select u2.id from jsonb_array_elements_text(case when jsonb_typeof(g.assigned_to) = 'array'
                                                               then g.assigned_to else '[]'::jsonb end) a
                join public.users u2 on u2.id::text = btrim(a)
               where public.kpis_setor_chave(u2.sector) = public.kpis_setor_chave(i.setor)
               order by u2.id limit 1) end,
           (q.dia::timestamp at time zone 'America/Sao_Paulo'), 0::numeric, false, false, false
      from i cross join jan cross join public.gantt_tasks g
           cross join lateral (select coalesce((g.concluido_em at time zone 'America/Sao_Paulo')::date,
                                               public.kpis_dia_texto(g.end_date)) as dia) q
     where i.fonte = 'cronograma'
       and g.deleted_at is null and g.parent_id is null
       and lower(btrim(coalesce(g.status, ''))) = 'done'
       and q.dia is not null
       and (q.dia::timestamp at time zone 'America/Sao_Paulo') >= jan.t0
       and (q.dia::timestamp at time zone 'America/Sao_Paulo') < jan.t1),
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

-- 6) EXECUTE ---------------------------------------------------------------------------------------------------------
revoke all on function public.kpis_dia_texto(text), public.kpis_fontes_calculo(), public.kpis_gantt_concluido() from public, anon;
revoke all on function public.kpis_gantt_concluido() from authenticated;
revoke all on function public.kpis_dia_texto(text) from authenticated;
grant execute on function public.kpis_dia_texto(text) to service_role;
grant execute on function public.kpis_fontes_calculo() to authenticated, service_role;
revoke all on function public.kpis_indicador_antes() from public, anon, authenticated;

-- 7) TRAVAS (as da 026) — se falhar, NADA fica gravado ----------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%'
              and pg_get_function_result(p.oid) ilike '%users%'
              and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))) then
    raise exception 'KPIS 027: função kpis_ devolveria users ao navegador. Nada foi criado.';
  end if;
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and has_function_privilege('anon', p.oid, 'EXECUTE'))
     or has_function_privilege('authenticated', 'public.kpis_calc_interno(uuid, date, date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpis_dia_texto(text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.kpis_fontes_calculo()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpis_indicador_antes()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpis_gantt_concluido()', 'EXECUTE') then
    raise exception 'KPIS 027: privilégio fora do esperado. Nada foi criado.';
  end if;
  -- o motor e a ligação nunca leem custo, economia nem salário (dá para deduzir salário de um setor pequeno)
  if pg_get_functiondef('public.kpis_calc_interno(uuid, date, date)'::regprocedure) ~* '(salary|_cost|custo|saving|hourly|taxa)'
     or pg_get_functiondef('public.kpis_valores_ligados(jsonb)'::regprocedure) ~* '(salary|_cost|custo|saving|hourly|taxa)' then
    raise exception 'KPIS 027: o cálculo citaria custo/salário. Nada foi criado.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: true · 12 · 12 · 0 · true · false · 0
select
  'cronograma' = any (public.kpis_fontes_calculo())                                                            as tem_cronograma,
  (select count(*) from public.gantt_tasks g where g.deleted_at is null and g.parent_id is null
      and lower(btrim(coalesce(g.status, ''))) = 'done' and public.kpis_dia_texto(g.end_date) is not null)     as concluidos_hoje,
  (select count(*) from public.gantt_tasks g where g.deleted_at is null and g.parent_id is null
      and g.concluido_em is not null)                                                                          as com_dia_da_conclusao,
  (select count(*) from public.kpis_indicador where tipo = 'calculado' and calc_fonte is null)                  as calculado_sem_fonte,
  has_function_privilege('authenticated', 'public.kpis_fontes_calculo()', 'EXECUTE')                           as tela_pergunta,
  has_function_privilege('authenticated', 'public.kpis_calc_interno(uuid, date, date)', 'EXECUTE')             as tela_executa_motor,
  (select count(*) from pg_proc where proname like 'kpis\_%' and has_function_privilege('anon', oid, 'EXECUTE')) as anonimo_executa;
