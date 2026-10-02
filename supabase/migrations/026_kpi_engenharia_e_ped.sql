-- 026 — KPI DOS SETORES: ENGENHARIA E P&D CALCULADOS PELA BASE (01/10/2026).
--
-- Pedido do Edson, 01/10: "Base nas informações que você já tem, agora crie os indicadores de engenharia e crie
-- os indicadores de P&D também. Porque isso já está na nossa base." — sem digitação dupla: o que o Dashboard já
-- calcula, o indicador calcula igual.
-- Decisões dele (01/10, com o levantamento na mão):
--   · "Igual ao Dashboard": a Engenharia é contada como o Dashboard conta, sem mexer no cadastro de ninguém —
--     fora quem é PROCESSOS (salvo o Edson) e, desde 01/09/2026, o P&D (setor P&D ou o Edson); registro sem
--     dono entra. É o escopo novo 'engenharia' (só o Edson e os admins de OKR o usam: o que o setor cria
--     continua contando só o setor — 025).
--   · "Só eu e os CEOs": o setor P&D é RESERVADO — os indicadores dele (as horas do Edson) aparecem para quem é
--     do setor, para o Edson e para os CEOs; o admin de OKR que não é CEO não vê, não cria, não lança e não
--     gerencia ali. A mesma régua do painel P&D Gerencial do Dashboard.
--   · "Descartar acima de 16 h": nas horas das atividades, sessão de mais de 16 h (esquecida aberta) fica fora
--     da soma — a régua do P&D Gerencial (MAX_SESSION_H). A contagem continua contando.
-- Antes (023/025): o calculado só lia as atividades do Desempenho Operacional, por pessoa do setor ou de todos;
-- somava a sessão esquecida inteira; o P&D era visto por todos os que veem todos os setores.
-- Agora:
--   · calc_fonte: 'atividades' (a de antes) | 'projetos' (as sessões de projeto: Liberação, Variação,
--     Desenvolvimento — a régua do "Total Ano" do Dashboard, pelo dia em que a sessão começou, todos os status)
--     | 'paradas' (interrupções, pelo começo) | 'inovacoes' (pelo cadastro; filtro de status opcional);
--   · calc_filtro: os tipos de projeto ou os status de inovação (maiúsculas, sem acento);
--   · calc_medida ganha 'media' (horas por projeto concluído) e 'pct_estimado' (% dos concluídos com estimativa
--     que ficaram dentro dela) — só em projetos, só com consolidação 'ultimo', pelo mês em que o projeto foi
--     CONCLUÍDO (o mês fechado não muda mais); mês sem base = sem valor (nulo), nunca zero;
--   · kpis_valores_ligados pula o período sem valor, e o KR ligado a indicador do P&D só mostra o número a quem
--     enxerga o P&D (antes: a quem lia o OKR do dono);
--   · tela ANTIGA (de antes da 026) não grava por cima de indicador que usa o cálculo novo — ela leria
--     'engenharia'/'media' como vazio e regravaria 'setor'/'horas' calada: o banco pede para recarregar
--     (versao_tela: a tela nova manda 26 em toda alteração; a coluna nunca guarda nada).
-- Revisado por 3 céticos em 01/10 (segurança, conta, compatibilidade); consertos aqui.
-- NUNCA lê coluna de custo, economia ou salário (trava no fim). A régua do P&D mora também em
-- src/utils/pndSplit.ts (PND_CUTOFF_ISO) — mudar uma sem a outra faz o KPI parar de bater com o Dashboard.
--
-- Rodar inteiro no SQL Editor, DEPOIS da 025. Tudo numa transação: se algo falhar, nada fica.

begin;
set local search_path = public, extensions;

do $$ begin
  if to_regprocedure('public.kpis_gerencio_indicador(uuid)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public'
                     and table_name = 'kpis_indicador' and column_name = 'do_setor') then
    raise exception 'KPIS 026: rode a 025 antes. Nada foi criado.';
  end if;
end $$;

-- 1) as colunas e a regra do calculado ------------------------------------------------------------------------
alter table public.kpis_indicador add column if not exists calc_fonte  text;
alter table public.kpis_indicador add column if not exists calc_filtro text[];
alter table public.kpis_indicador add column if not exists versao_tela smallint;   -- marca da tela nova; nunca guarda nada
alter table public.kpis_indicador drop constraint if exists kpis_ind_tipo;
-- os calculados de antes viram 'atividades' SEM disparar o gatilho (não mexe na versão nem em quem alterou)
alter table public.kpis_indicador disable trigger kpis_indicador_antes;
update public.kpis_indicador set calc_fonte = 'atividades' where tipo = 'calculado' and calc_fonte is null;
alter table public.kpis_indicador enable trigger kpis_indicador_antes;
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
grant insert (calc_fonte, calc_filtro), update (calc_fonte, calc_filtro, versao_tela) on public.kpis_indicador to authenticated;

-- 2) regras puras -----------------------------------------------------------------------------------------------
-- "Liberação" → "LIBERACAO" (o mesmo que o isTypeMatch do Dashboard); serve também ao status das inovações.
create or replace function public.kpis_maiusculo(p text) returns text language sql immutable set search_path = public as $f$
  select upper(btrim(translate(coalesce(p, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')))
$f$;
-- O corte do P&D (espelho de PND_CUTOFF_ISO, src/utils/pndSplit.ts — decisão do Edson de 23/09).
create or replace function public.kpis_corte_ped() returns date language sql immutable set search_path = public as $f$
  select date '2026-09-01'
$f$;
-- Setor RESERVADO: só quem é dele, o Edson e os CEOs veem os indicadores (decisão do Edson, 01/10: P&D).
-- Para reservar outro setor, acrescentar a chave dele aqui (kpis_setor_chave: 'P&D' → 'p d').
create or replace function public.kpis_setor_reservado(p_setor text) returns boolean language sql immutable set search_path = public as $f$
  select coalesce(public.kpis_setor_chave(p_setor) = any (array['p d']), false)
$f$;

-- 3) quem vê o reservado e quem vê cada setor -----------------------------------------------------------------
create or replace function public.kpis_ve_reservado() returns boolean language sql stable security definer set search_path = public as $f$
  select public.kpis_cadastrado() and not public.kpis_visualizador()
     and (coalesce(auth.uid() = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid, false)
          or exists (select 1 from public.users u where u.id = auth.uid() and coalesce(u.role, '') = 'CEO'))
$f$;
create or replace function public.kpis_vejo_setor(p_setor text) returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce(
       (public.kpis_meu_setor() is not null and public.kpis_setor_chave(p_setor) = public.kpis_meu_setor())
    or (public.kpis_ve_todos() and (not public.kpis_setor_reservado(p_setor) or public.kpis_ve_reservado())), false)
$f$;
create or replace function public.kpis_vejo_indicador(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i where i.id = p_indicador and public.kpis_vejo_setor(i.setor))
$f$;
-- LANÇA: quem é do setor; o Edson / admin de OKR em qualquer setor que ele VÊ.
create or replace function public.kpis_posso_lancar(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i
                  where i.id = p_indicador and i.ativo and i.tipo = 'manual'
                    and ((public.kpis_meu_setor() is not null and public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())
                         or (public.kpis_administra() and public.kpis_vejo_setor(i.setor))))
$f$;
-- CRIA e GERENCIA (025): o Edson / admin de OKR onde VÊ; o setor no próprio setor (o que ele criou).
create or replace function public.kpis_posso_criar(p_setor text) returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce(public.kpis_administra() and public.kpis_vejo_setor(p_setor), false)
      or (public.kpis_meu_setor() is not null and public.kpis_setor_chave(p_setor) = public.kpis_meu_setor())
$f$;
create or replace function public.kpis_gerencio(p_setor text, p_do_setor boolean) returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce(public.kpis_administra() and public.kpis_vejo_setor(p_setor), false)
      or (coalesce(p_do_setor, false) and public.kpis_meu_setor() is not null
          and public.kpis_setor_chave(p_setor) = public.kpis_meu_setor())
$f$;
create or replace function public.kpis_gerencio_indicador(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i where i.id = p_indicador and public.kpis_gerencio(i.setor, i.do_setor))
$f$;
-- O DONO do OKR enxerga o indicador? (a régua da ligação KR↔indicador) — com o setor reservado.
create or replace function public.kpis_dono_ve(p_dono text, p_setor text) returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce((select case
      when u.id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid then true
      when u.desligado_em is not null and u.desligado_em < public.kpis_hoje() then false
      when (coalesce(u.okr_viewer, false) or coalesce(u.role, '') = 'ADM_EXTERNO') and not coalesce(u.okr_admin, false) then false
      when coalesce(u.role, '') = 'CEO' then true
      when coalesce(u.okr_admin, false) and not public.kpis_setor_reservado(p_setor) then true
      else public.kpis_setor_chave(u.sector) = public.kpis_setor_chave(p_setor) end
    from public.users u where lower(btrim(u.username)) = lower(btrim(p_dono)) limit 1), false)
$f$;

create or replace function public.kpis_meu_acesso()
returns table (cadastrado boolean, visualizador boolean, ve_todos boolean, administra boolean,
               setor_chave text, setor_nome text, indicadores integer, posso_lancar integer, cria boolean)
language sql stable security definer set search_path = public as $f$
  select public.kpis_cadastrado(), public.kpis_visualizador(), public.kpis_ve_todos(), public.kpis_administra(),
         public.kpis_meu_setor(),
         (select nullif(btrim(u.sector), '') from public.users u where u.id = auth.uid()
             and public.kpis_cadastrado() and not public.kpis_visualizador()),
         (select count(*)::int from public.kpis_indicador i where i.ativo and public.kpis_vejo_setor(i.setor)),
         (select count(*)::int from public.kpis_indicador i where i.ativo and i.tipo = 'manual'
             and ((public.kpis_meu_setor() is not null and public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())
                  or (public.kpis_administra() and public.kpis_vejo_setor(i.setor)))),
         coalesce(public.kpis_administra(), false) or public.kpis_meu_setor() is not null
$f$;

create or replace function public.kpis_setores()
returns table (chave text, nome text, pessoas integer, grafias text[])
language sql stable security definer set search_path = public as $f$
  with g as (
    select public.kpis_setor_chave(u.sector) as ch, btrim(u.sector) as gr, count(*)::int as n
      from public.users u
     where public.kpis_ve_todos()
       and public.kpis_setor_chave(u.sector) is not null
       and (not public.kpis_setor_reservado(u.sector) or public.kpis_ve_reservado())
       and (u.desligado_em is null or u.desligado_em >= public.kpis_hoje())
       and not ((coalesce(u.okr_viewer, false) or coalesce(u.role, '') = 'ADM_EXTERNO') and not coalesce(u.okr_admin, false))
       and lower(coalesce(u.username, '')) not like 'zz\_%'
     group by 1, 2)
  select ch, (array_agg(gr order by n desc, gr))[1], sum(n)::int, array_agg(gr order by n desc, gr) from g group by ch order by 2
$f$;

-- 4) o gatilho do indicador (o da 025 + a fonte e o filtro) ----------------------------------------------------
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

-- 5) o motor do calculado — a MESMA assinatura e o mesmo retorno (a série da tela e o KR ligado não mudam) ------
-- Interna (sem EXECUTE para o navegador): quem chama já conferiu o acesso.
-- · cada registro cai no período do DIA DE JOINVILLE em que começou (atividade e projeto: start_time; parada:
--   start_time; inovação: created_at); nunca passa do período de hoje; os 800 períodos mais recentes;
-- · atividades: só as encerradas, dos tipos escolhidos; horas = duração (duration_seconds; sem ela ou 0,
--   fim − início); na soma de HORAS, sessão de mais de 16 h fica fora (esquecida aberta — decisão de 01/10);
-- · projetos: todas as sessões (qualquer status) dos tipos escolhidos, pelo dia em que começaram; horas = tempo
--   ativo; média = horas por projeto CONCLUÍDO e % no estimado = concluídos com estimativa que ficaram dentro dela —
--   esses dois pelo dia em que o projeto foi CONCLUÍDO (end_time: o mês fechado não muda mais);
-- · paradas: horas = total_time_seconds (horas úteis, a régua do Dashboard); inovações: contagem;
-- · de quem: 'setor' = donos do setor do indicador (cadastro de hoje); 'todos' = todo registro, com ou sem dono;
--   'engenharia' = a régua do Dashboard (fora PROCESSOS salvo o Edson; fora o P&D desde 01/09/2026; sem dono entra);
-- · período sem registro: horas e quantidade = 0; média e % = nulo (não há base).
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

-- 6) a ligação com o OKR (a da 023 + "pula o período sem valor": média e % sem base são nulos) ------------------
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
       and (v_servidor or not public.kpis_setor_reservado(i.setor)                    -- (4) 026: P&D só p/ quem vê
            or public.kpis_vejo_indicador(i.id))
       and exists (select 1 from public.okr_state s,                                  -- (2)
                          jsonb_path_query(s.data, 'lax $.** ? (@.kpiId == $id)', jsonb_build_object('id', i.id::text)) kr
                    where s.owner_key = p.p_dono
                      and (v_servidor or public.kpis_vejo_indicador(i.id)
                           or (coalesce(kr->>'start', '') = p.p_de and coalesce(kr->>'due', '') = p.p_ate)))),
  serie as (   -- manual: os lançamentos; calculado: a série calculada (até hoje)
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
     where s.val is not null                                                          -- 026: período sem base não conta
       and (o.d_ate is null or s.per <= o.d_ate)
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

-- 7) as políticas: ler = vejo o setor; editar/apagar = gerencio (com o reservado) -------------------------------
drop policy if exists kpis_indicador_ler    on public.kpis_indicador;
drop policy if exists kpis_indicador_criar  on public.kpis_indicador;
drop policy if exists kpis_indicador_editar on public.kpis_indicador;
drop policy if exists kpis_indicador_apagar on public.kpis_indicador;
create policy kpis_indicador_ler    on public.kpis_indicador for select to authenticated using (public.kpis_vejo_setor(setor));
create policy kpis_indicador_criar  on public.kpis_indicador for insert to authenticated with check (public.kpis_posso_criar(setor));
create policy kpis_indicador_editar on public.kpis_indicador for update to authenticated
  using (public.kpis_gerencio(setor, do_setor)) with check (public.kpis_gerencio(setor, do_setor));
create policy kpis_indicador_apagar on public.kpis_indicador for delete to authenticated using (public.kpis_gerencio(setor, do_setor));
-- apagar lançamento: o Edson / admin de OKR, só onde VÊ (sem filtro, um DELETE não passaria pela política de leitura)
drop policy if exists kpis_lancamento_apagar on public.kpis_lancamento;
create policy kpis_lancamento_apagar on public.kpis_lancamento for delete to authenticated
  using ((select public.kpis_administra()) and public.kpis_vejo_indicador(indicador_id));
-- (meta, lançamento e histórico: a leitura passa pela política do indicador; a escrita por kpis_gerencio_indicador
--  e kpis_posso_lancar, refeitas acima — as políticas da 025 continuam as mesmas)

-- 8) EXECUTE -----------------------------------------------------------------------------------------------------
revoke all on function public.kpis_maiusculo(text), public.kpis_corte_ped(), public.kpis_setor_reservado(text),
  public.kpis_ve_reservado(), public.kpis_vejo_setor(text), public.kpis_gerencio(text, boolean) from public, anon;
-- as que rodam DENTRO das políticas precisam de EXECUTE para o navegador
grant execute on function public.kpis_setor_reservado(text), public.kpis_ve_reservado(), public.kpis_vejo_setor(text),
  public.kpis_gerencio(text, boolean) to authenticated, service_role;
-- só por dentro (o motor): o navegador NÃO executa
revoke all on function public.kpis_maiusculo(text), public.kpis_corte_ped() from authenticated;
grant execute on function public.kpis_maiusculo(text), public.kpis_corte_ped() to service_role;
revoke all on function public.kpis_indicador_antes() from public, anon, authenticated;

-- 9) TRAVAS (as da 023/025 + o motor não lê custo) — se falhar, NADA fica gravado -----------------------------
do $$ begin
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%'
              and pg_get_function_result(p.oid) ilike '%users%'
              and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))) then
    raise exception 'KPIS 026: função kpis_ devolveria users ao navegador. Nada foi criado.';
  end if;
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and not p.prosecdef
              and pg_get_functiondef(p.oid) ilike '%okr_state%'
              and has_function_privilege('authenticated', p.oid, 'EXECUTE')) then
    raise exception 'KPIS 026: função kpis_ cita okr_state sem SECURITY DEFINER. Nada foi criado.';
  end if;
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and has_function_privilege('anon', p.oid, 'EXECUTE'))
     or has_function_privilege('authenticated', 'public.kpis_calc_interno(uuid, date, date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpis_dono_ve(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpis_maiusculo(text)', 'EXECUTE')
     or not has_column_privilege('authenticated', 'public.kpis_indicador', 'calc_fonte', 'INSERT')
     or not has_column_privilege('authenticated', 'public.kpis_indicador', 'calc_filtro', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.kpis_indicador', 'versao_tela', 'UPDATE')
     or has_column_privilege('authenticated', 'public.kpis_indicador', 'versao_tela', 'INSERT')
     or has_column_privilege('authenticated', 'public.kpis_indicador', 'do_setor', 'UPDATE') then
    raise exception 'KPIS 026: privilégio fora do esperado. Nada foi criado.';
  end if;
  -- o motor e a ligação nunca leem custo, economia nem salário (dá para deduzir salário de um setor pequeno)
  if pg_get_functiondef('public.kpis_calc_interno(uuid, date, date)'::regprocedure) ~* '(salary|_cost|custo|saving|hourly|taxa)'
     or pg_get_functiondef('public.kpis_valores_ligados(jsonb)'::regprocedure) ~* '(salary|_cost|custo|saving|hourly|taxa)' then
    raise exception 'KPIS 026: o cálculo citaria custo/salário. Nada foi criado.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: 0 · true · true · 13 · false · false · true · 0 · 0 · 0
select
  (select count(*) from public.kpis_indicador where tipo = 'calculado' and calc_fonte is null)                       as calculado_sem_fonte,
  public.kpis_setor_reservado('P&D')                                                                                as ped_reservado,
  not public.kpis_setor_reservado('Fábrica')                                                                        as fabrica_aberta,
  (select count(*) from pg_policies where tablename like 'kpis\_%')                                                 as politicas,
  has_function_privilege('authenticated', 'public.kpis_calc_interno(uuid, date, date)', 'EXECUTE')                  as tela_executa_motor,
  has_column_privilege('authenticated', 'public.kpis_indicador', 'do_setor', 'UPDATE')                              as tela_muda_do_setor,
  has_column_privilege('authenticated', 'public.kpis_indicador', 'calc_fonte', 'INSERT')                            as tela_grava_fonte,
  (select count(*) from pg_proc where proname like 'kpis\_%' and has_function_privilege('anon', oid, 'EXECUTE'))    as anonimo_executa,
  (select count(*) from public.kpis_indicador where public.kpis_setor_reservado(setor))                             as indicadores_no_ped,
  (select count(*) from public.kpis_indicador where versao_tela is not null)                                        as versao_guardada;
