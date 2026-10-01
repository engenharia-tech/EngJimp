-- 023 — KPI DOS SETORES (30/09/2026).
--
-- Pedido do Edson (30/09): "agora o KPI genérico para todos os outros usuários" / "os demais setores
-- que não são da engenharia". Decisões dele no mesmo dia:
--   · INDICADORES COM META: nome, unidade, meta, "quanto maior, melhor" / "quanto menor, melhor";
--     cada indicador escolhe a frequência (semanal, mensal, trimestral), com aviso de atraso;
--   · quem CRIA os indicadores: o Edson (pelo id) e os admins de OKR (hoje Nascimento, Paulo, Julio);
--   · quem LANÇA e VÊ: as pessoas do setor, só o seu setor. "Sim: o Edson e os admins de OKR também
--     LANÇAM e CORRIGEM valores de QUALQUER setor (correção registrada com quem, quando e motivo)";
--   · o Edson, os CEOs e os admins de OKR veem todos os setores;
--   · JÁ LIGADO AO OKR: um KR pode apontar para um indicador e o valor do KR vem do KPI (lido na
--     hora, NUNCA gravado no OKR);
--   · um indicador pode ser CALCULADO pelas atividades do Desempenho Operacional (ex.: "horas de P&D
--     no mês") — sem lançar o número à mão.
--   · "Só o Edson e os admins de OKR mudam o SETOR de qualquer pessoa" — fora o CEO, mesmo admin de OKR
--     (01/10: "ceo não pode dar cargo a ninguem e nem liberar acesso, o objetivo é visualização macro").
--     Isso é do servidor (/api/users/save), não desta migração.
--
-- Antes: não existia KPI fora da engenharia.
-- Agora: 4 tabelas kpis_* (indicador, meta com vigência, lançamento, histórico imutável de
--   correções), RLS e GRANT por coluna no molde da Agenda (012), e RPCs só de leitura:
--   kpis_meu_acesso (menu), kpis_setores (lista do cadastro), kpis_serie_calculada (indicador
--   calculado) e kpis_valores_ligados (o valor do KR ligado).
-- Por quê do prefixo kpis_: o kpi_ já é de kpi_desligar_usuario (022) e kpi_rename_login. O rollback
--   (023_rollback.sql) apaga por LISTA EXPLÍCITA, nunca por padrão.
--
-- O SETOR: a pessoa é do setor do indicador quando kpis_setor_chave(users.sector) =
--   kpis_setor_chave(indicador.setor) — ignora maiúscula, acento, espaço e pontuação ("Suprimentos",
--   " SUPRIMENTOS." e "suprimentos" são o mesmo setor). NÃO junta singular com plural nem nomes
--   diferentes. Lido do cadastro a cada consulta (mudou o setor, o acesso muda na hora).
--
-- NÃO toca: users (só lê), okr_state (só lê), agenda_*, kpi_desligar_usuario, kpi_rename_login.
-- Precisa: as funções do OKR que só existem em produção e a 022 (users.desligado_em) — a trava do
--   passo 0 para com erro se faltarem. Pode rodar de novo (if not exists / or replace / drop policy).
--
-- Revisão (cético de 30/09, todas aplicadas aqui):
--   · autor (criado_por, lancado_por, hist.por) com ON DELETE RESTRICT — "desligar, não excluir"; com
--     SET NULL + gatilho que repõe o autor a FK ficaria órfã e a cópia de segurança não restauraria;
--   · os gatilhos conferem o acesso ANTES de responder (senão o uuid de outro setor revelava início e
--     sentido do indicador); só admin apaga lançamento (quem é do setor corrige, com motivo);
--   · o gatilho que impede apagar indicador ligado só conta OKR vivo cujo dono enxerga o indicador;
--   · políticas com (select função()) — avaliadas uma vez por consulta;
--   · a sequência do histórico sem privilégio do navegador; conferência de EXECUTE do anônimo = 0;
--   · 'ultimo' respeita o INÍCIO do KR: um KR do 1º trimestre não mostra o valor de dezembro.
-- Revisão de 01/10 (6 frentes + um cético por achado; todas aplicadas aqui):
--   · o VISUALIZADOR só lê o valor na janela de um KR que existe (início e prazo iguais aos gravados) e
--     não recebe o nome do indicador — antes escolhia a janela e tirava a série inteira de um setor;
--   · dono DESLIGADO não "enxerga" mais o indicador: o link público dele para de mostrar o número vivo;
--   · calculado + 'ultimo' = o último período FECHADO (no dia 1º o mês corrente vale 0);
--   · trocar a frequência ou o início realinha as metas (a 1ª vigência acompanha o início);
--   · kpis_meta.por com ON DELETE RESTRICT (quem pôs meta não é excluído calado — e o SET NULL disparava
--     o gatilho da meta e a exclusão falhava com "sem acesso");
--   · motivo até 300 letras de verdade (o gatilho zerava o campo antes do CHECK);
--   · horas do calculado: duration_seconds = 0 cai para fim − início (a régua do Desempenho Operacional);
--   · a série calculada guarda os 800 períodos MAIS RECENTES (cortava o fim).
-- =====================================================================================================

begin;
set local search_path = public, extensions;

-- 0) TRAVAS — param com erro; nada é criado ------------------------------------------------------------
do $$ begin
  if to_regprocedure('public.okr_my_key()') is null or to_regprocedure('public.okr_is_master()') is null
     or to_regprocedure('public.okr_is_ceo()') is null or to_regprocedure('public.okr_is_viewer()') is null then
    raise exception 'KPIS 023: faltam as funções do OKR de produção (okr_my_key/okr_is_master/okr_is_ceo/okr_is_viewer). Nada foi criado — mande o print ao Claude.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'users' and column_name = 'desligado_em') then
    raise exception 'KPIS 023: rode a 022 antes (users.desligado_em). Nada foi criado.';
  end if;
end $$;

-- 1) REGRAS PURAS — não leem tabela ----------------------------------------------------------------------
create or replace function public.kpis_hoje() returns date language sql stable set search_path = '' as
$f$ select (pg_catalog.now() at time zone 'America/Sao_Paulo')::date $f$;

create or replace function public.kpis_setor_chave(p text) returns text language sql immutable set search_path = public as $f$
  select nullif(btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
    'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', ' ', 'g')), '')
$f$;

create or replace function public.kpis_inicio_periodo(p_freq text, p_dia date) returns date language sql immutable set search_path = public as $f$
  select case p_freq
    when 'semanal'    then p_dia - (extract(isodow from p_dia)::int - 1)        -- segunda-feira ISO
    when 'mensal'     then date_trunc('month',   p_dia::timestamp)::date        -- ::timestamp: sem fuso da sessão
    when 'trimestral' then date_trunc('quarter', p_dia::timestamp)::date end
$f$;

create or replace function public.kpis_fim_periodo(p_freq text, p_inicio date) returns date language sql immutable set search_path = public as $f$
  select case p_freq
    when 'semanal'    then p_inicio + 6
    when 'mensal'     then (p_inicio + interval '1 month'  - interval '1 day')::date
    when 'trimestral' then (p_inicio + interval '3 months' - interval '1 day')::date end
$f$;

create or replace function public.kpis_proximo_periodo(p_freq text, p_inicio date) returns date language sql immutable set search_path = public as $f$
  select public.kpis_fim_periodo(p_freq, p_inicio) + 1
$f$;

-- Data do OKR (texto do KR) → date, ou nulo se torta (há KRs com ano "0026"). Mesma régua do parseIsoDay.
create or replace function public.kpis_data_ou_nulo(p text) returns date language plpgsql immutable set search_path = public as $f$
declare d date; begin
  if p is null or btrim(p) !~ '^\d{4}-\d{2}-\d{2}($|T)' then return null; end if;
  d := substr(btrim(p), 1, 10)::date;
  return case when d between date '2000-01-01' and date '2100-12-31' then d end;
exception when others then return null; end $f$;

-- 2) QUEM É QUEM — lido do CADASTRO por auth.uid() (nunca do crachá). "O master vence": o Edson e o
--    admin de OKR nunca são visualizador (a mesma regra de okr_is_viewer / ehVisualizador / isOkrViewer).
create or replace function public.kpis_cadastrado() returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.users u where u.id = auth.uid()
                  and (u.desligado_em is null or u.desligado_em >= public.kpis_hoje()))
$f$;

create or replace function public.kpis_visualizador() returns boolean language sql stable security definer set search_path = public as $f$
  select case when auth.uid() = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid then false
    else coalesce((select (coalesce(u.okr_viewer, false) or coalesce(u.role, '') = 'ADM_EXTERNO') and not coalesce(u.okr_admin, false)
                     from public.users u where u.id = auth.uid()), true) end      -- sem linha = visualizador (fecha)
$f$;

-- CRIA indicador e meta, e LANÇA em qualquer setor: o Edson (pelo id) e os admins de OKR. Vale na hora.
create or replace function public.kpis_administra() returns boolean language sql stable security definer set search_path = public as $f$
  select public.kpis_cadastrado() and (coalesce(auth.uid() = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid, false)
      or exists (select 1 from public.users u where u.id = auth.uid() and coalesce(u.okr_admin, false)))
$f$;

-- VÊ todos os setores: o Edson, os admins de OKR e os CEOs.
create or replace function public.kpis_ve_todos() returns boolean language sql stable security definer set search_path = public as $f$
  select public.kpis_cadastrado() and not public.kpis_visualizador()
     and (coalesce(auth.uid() = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid, false)
          or exists (select 1 from public.users u where u.id = auth.uid()
                      and (coalesce(u.okr_admin, false) or coalesce(u.role, '') = 'CEO')))
$f$;

create or replace function public.kpis_meu_setor() returns text language sql stable security definer set search_path = public as $f$
  select case when public.kpis_cadastrado() and not public.kpis_visualizador()
    then (select public.kpis_setor_chave(u.sector) from public.users u where u.id = auth.uid()) end
$f$;

-- 3) TABELAS ----------------------------------------------------------------------------------------------
create table if not exists public.kpis_indicador (
  id             uuid primary key default gen_random_uuid(),
  setor          text not null,                 -- rótulo escolhido na lista do cadastro (kpis_setores)
  nome           text not null,
  descricao      text,                          -- "como medir / de onde vem"
  unidade        text not null default '',      -- %, R$, dias, h, un… (só exibição)
  casas          smallint not null default 1,
  sentido        text not null,                 -- 'maior' | 'menor'
  frequencia     text not null,                 -- 'semanal' | 'mensal' | 'trimestral'
  consolidacao   text not null default 'ultimo',-- KR ligado: 'ultimo' (nível: %, dias) | 'soma' (acumula: R$, peças, horas)
  prazo_dias     smallint,                      -- dias depois do fim do período até ficar ATRASADO; nulo = padrão da tela
  inicio         date not null,                 -- 1º período cobrado (o gatilho alinha ao início do período)
  ativo          boolean not null default true, -- arquivar = false
  tipo           text not null default 'manual',-- 'manual' (lançado) | 'calculado' (pelas atividades)
  calc_tipos     uuid[],                        -- calculado: os tipos de atividade (activity_types.id) que contam
  calc_medida    text,                          -- calculado: 'horas' (soma da duração) | 'quantidade' (nº de atividades)
  calc_escopo    text,                          -- calculado: 'setor' (pessoas do setor do indicador) | 'todos'
  criado_por     uuid references public.users(id) on delete restrict,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid references public.users(id) on delete set null,
  atualizado_em  timestamptz not null default now(),   -- VERSÃO (trava otimista, como agenda_item.updated_at)
  constraint kpis_ind_setor   check (public.kpis_setor_chave(setor) is not null and length(setor) <= 60),
  constraint kpis_ind_nome    check (length(btrim(nome)) between 2 and 120),
  constraint kpis_ind_desc    check (descricao is null or length(descricao) <= 1000),
  constraint kpis_ind_unid    check (length(unidade) <= 12),
  constraint kpis_ind_casas   check (casas between 0 and 4),
  constraint kpis_ind_sentido check (sentido in ('maior', 'menor')),
  constraint kpis_ind_freq    check (frequencia in ('semanal', 'mensal', 'trimestral')),
  constraint kpis_ind_consol  check (consolidacao in ('ultimo', 'soma')),
  constraint kpis_ind_prazo   check (prazo_dias is null or prazo_dias between 0 and 60),
  constraint kpis_ind_inicio  check (inicio between date '2000-01-01' and date '2100-12-31'),
  constraint kpis_ind_tipo    check (
    (tipo = 'manual' and calc_tipos is null and calc_medida is null and calc_escopo is null)
    or (tipo = 'calculado' and cardinality(calc_tipos) between 1 and 40
        and calc_medida in ('horas', 'quantidade') and calc_escopo in ('setor', 'todos'))));
create unique index if not exists kpis_indicador_nome_unico on public.kpis_indicador (public.kpis_setor_chave(setor), lower(btrim(nome))) where ativo;
create index if not exists kpis_indicador_setor_idx on public.kpis_indicador (public.kpis_setor_chave(setor));

create table if not exists public.kpis_meta (    -- VIGÊNCIA: o período P usa a linha de maior vale_desde <= P
  indicador_id  uuid not null references public.kpis_indicador(id) on delete cascade,
  vale_desde    date not null,
  meta          numeric not null,
  limite_alerta numeric,                          -- AMARELO até aqui; nulo = 10% de |meta| (regra na tela)
  por           uuid references public.users(id) on delete restrict,   -- autor: desligar, não excluir
  em            timestamptz not null default now(),
  primary key (indicador_id, vale_desde),
  constraint kpis_meta_num check (meta between -1e15 and 1e15 and (limite_alerta is null or limite_alerta between -1e15 and 1e15)));

create table if not exists public.kpis_lancamento (
  id            uuid primary key default gen_random_uuid(),
  indicador_id  uuid not null references public.kpis_indicador(id) on delete restrict,
  periodo       date not null,                  -- INÍCIO do período (o gatilho alinha)
  valor         numeric not null,
  comentario    text,
  motivo        text,                           -- só de passagem: o gatilho leva ao histórico e zera
  lancado_por   uuid references public.users(id) on delete restrict,
  lancado_em    timestamptz not null default now(),
  alterado_por  uuid references public.users(id) on delete set null,
  alterado_em   timestamptz,
  atualizado_em timestamptz not null default now(),   -- VERSÃO
  constraint kpis_lanc_unico   unique (indicador_id, periodo),
  constraint kpis_lanc_valor   check (valor between -1e15 and 1e15),
  constraint kpis_lanc_coment  check (comentario is null or length(comentario) <= 500),
  constraint kpis_lanc_motivo  check (motivo is null or length(motivo) <= 300),
  constraint kpis_lanc_periodo check (periodo between date '2000-01-01' and date '2100-12-31'));

create table if not exists public.kpis_lancamento_hist (   -- IMUTÁVEL para o navegador (só SELECT); escrito pelo gatilho
  id               bigint generated always as identity primary key,
  lancamento_id    uuid not null,
  indicador_id     uuid not null references public.kpis_indicador(id) on delete restrict,
  periodo          date not null,
  acao             text not null check (acao in ('corrigiu', 'apagou')),
  valor_antes      numeric,
  valor_depois     numeric,
  comentario_antes text,
  motivo           text constraint kpis_hist_motivo check (motivo is null or length(motivo) <= 300),
  por              uuid references public.users(id) on delete restrict,
  em               timestamptz not null default clock_timestamp());
create index if not exists kpis_hist_ind_idx on public.kpis_lancamento_hist (indicador_id, periodo);

-- 4) FUNÇÕES QUE LEEM AS TABELAS -------------------------------------------------------------------------
-- LANÇA: quem é do setor do indicador, ou o Edson / admin de OKR (qualquer setor). Só indicador ativo e
-- manual (o calculado não se lança à mão).
create or replace function public.kpis_posso_lancar(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i
                  where i.id = p_indicador and i.ativo and i.tipo = 'manual'
                    and (public.kpis_setor_chave(i.setor) = public.kpis_meu_setor() or public.kpis_administra()))
$f$;

-- Campo calculado do PostgREST (select=*,kpis_pode_lancar): a tela LÊ a regra, não a refaz.
create or replace function public.kpis_pode_lancar(i public.kpis_indicador) returns boolean language sql stable set search_path = public as $f$
  select public.kpis_posso_lancar(i.id)
$f$;

-- VÊ o indicador (a mesma régua da política de leitura) — usado pelas RPCs SECURITY DEFINER.
create or replace function public.kpis_vejo_indicador(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i
                  where i.id = p_indicador
                    and (public.kpis_ve_todos() or public.kpis_setor_chave(i.setor) = public.kpis_meu_setor()))
$f$;

-- O DONO do OKR enxerga o indicador? É a régua da ligação KR↔indicador. Só dentro das RPCs.
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

-- INDICADOR CALCULADO — a série por período, a partir das atividades do Desempenho Operacional.
-- Interna (sem EXECUTE para o navegador): quem chama já conferiu o acesso.
-- · pessoas: as do SETOR do indicador (cadastro de hoje) ou todas (calc_escopo);
-- · atividade conta no período do DIA DE JOINVILLE em que começou; só as encerradas (end_time);
-- · horas = soma da duração (duration_seconds; sem ela ou 0, fim − início — a régua do Desempenho
--   Operacional e do Dashboard); quantidade = nº de atividades;
-- · período sem atividade vale 0 (não é "sem lançamento"); nunca passa do período de hoje.
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

-- Pública (para a tela): confere o acesso, depois devolve a série. No máximo ~15 anos por pedido.
create or replace function public.kpis_serie_calculada(p_indicador uuid, p_de date, p_ate date)
returns table (periodo date, valor numeric, atividades integer)
language plpgsql stable security definer set search_path = public as $f$
begin
  if not public.kpis_cadastrado() or not public.kpis_vejo_indicador(p_indicador) then return; end if;
  return query select c.periodo, c.valor, c.atividades from public.kpis_calc_interno(p_indicador, p_de, p_ate) c;
end $f$;

create or replace function public.kpis_meu_acesso()
returns table (cadastrado boolean, visualizador boolean, ve_todos boolean, administra boolean,
               setor_chave text, setor_nome text, indicadores integer, posso_lancar integer)
language sql stable security definer set search_path = public as $f$
  select public.kpis_cadastrado(), public.kpis_visualizador(), public.kpis_ve_todos(), public.kpis_administra(),
         public.kpis_meu_setor(),
         (select nullif(btrim(u.sector), '') from public.users u where u.id = auth.uid()
             and public.kpis_cadastrado() and not public.kpis_visualizador()),
         (select count(*)::int from public.kpis_indicador i where i.ativo
             and (public.kpis_ve_todos() or public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())),
         (select count(*)::int from public.kpis_indicador i where i.ativo and i.tipo = 'manual'
             and (public.kpis_administra() or public.kpis_setor_chave(i.setor) = public.kpis_meu_setor()))
$f$;   -- o menu e o cabeçalho usam isto, não as marcas do login (okr_admin só chega ao cliente no login)

-- A lista de setores do cadastro (só nomes e contagens; nunca devolve linha de users — trava da 022).
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

-- Os tipos de atividade (para montar indicador calculado). Só nomes; só para quem cadastra.
create or replace function public.kpis_tipos_atividade()
returns table (id uuid, nome text, ativo boolean)
language sql stable security definer set search_path = public as $f$
  select t.id, t.name, coalesce(t.is_active, true) from public.activity_types t
   where public.kpis_administra() order by t.name
$f$;

-- 5) GATILHOS — SECURITY DEFINER; EXECUTE revogado do navegador. Erros: P0001 com uma marca (NUNCA 40001);
--    falta de acesso: 42501 ANTES de responder qualquer coisa sobre o indicador.
create or replace function public.kpis_indicador_antes() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid(); new.criado_em := clock_timestamp();
  else
    new.id := old.id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
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
  new.inicio := public.kpis_inicio_periodo(new.frequencia, coalesce(new.inicio, public.kpis_hoje()));
  if tg_op = 'UPDATE' and exists (select 1 from public.kpis_lancamento l where l.indicador_id = old.id and l.periodo < new.inicio) then
    raise exception 'KPIS_INICIO_DEPOIS_DE_LANCAMENTO: há lançamento antes do novo início.' using errcode = 'P0001';
  end if;
  new.atualizado_por := auth.uid(); new.atualizado_em := clock_timestamp();
  return new;
end $f$;

-- Trocou a frequência ou o início (só sem lançamento antes, ver acima): as metas vão para o começo do
-- período novo que as contém, nunca antes do início; na mesma vigência nova fica a mais recente; e a
-- 1ª vigência acompanha o início (o 1º período não fica "sem meta") — se ela já cobria o início antigo.
-- AFTER: aqui o kpis_meta_antes já lê a frequência nova na tabela.
create or replace function public.kpis_indicador_depois() returns trigger language plpgsql security definer set search_path = public as $f$
declare v_cobria boolean;
begin
  if new.frequencia is distinct from old.frequencia or new.inicio is distinct from old.inicio then
    -- A 1ª vigência só acompanha o início se ela já valia desde o início antigo: uma meta posta de
    -- propósito mais tarde (jan–jun "sem meta", meta desde jul) não é puxada para trás.
    v_cobria := exists (select 1 from public.kpis_meta m where m.indicador_id = new.id and m.vale_desde <= old.inicio);
    perform set_config('kpis.realinhando', 'sim', true);
    delete from public.kpis_meta m
     where m.indicador_id = new.id
       and exists (select 1 from public.kpis_meta m2
                    where m2.indicador_id = new.id and m2.vale_desde > m.vale_desde
                      and greatest(new.inicio, public.kpis_inicio_periodo(new.frequencia, m2.vale_desde))
                        = greatest(new.inicio, public.kpis_inicio_periodo(new.frequencia, m.vale_desde)));
    update public.kpis_meta set vale_desde = greatest(new.inicio, public.kpis_inicio_periodo(new.frequencia, vale_desde))
     where indicador_id = new.id;
    if v_cobria then
      update public.kpis_meta set vale_desde = new.inicio
       where indicador_id = new.id
         and vale_desde = (select min(m.vale_desde) from public.kpis_meta m where m.indicador_id = new.id)
         and vale_desde > new.inicio;
    end if;
    perform set_config('kpis.realinhando', '', true);
  end if;
  return null;
end $f$;

create or replace function public.kpis_indicador_antes_apagar() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  -- Só conta OKR vivo cujo DONO enxerga o indicador (um uuid colado num OKR qualquer não trava o apagar).
  if exists (select 1 from public.okr_state s
              where s.owner_key not like 'excluido:%'
                and public.kpis_dono_ve(s.owner_key, old.setor)
                and jsonb_path_exists(s.data, 'lax $.** ? (@.kpiId == $id)', jsonb_build_object('id', old.id::text))) then
    raise exception 'KPIS_LIGADO_AO_OKR: há KR ligado a este indicador; desligue antes (ou arquive).' using errcode = 'P0001';
  end if;
  return old;   -- com lançamento ou histórico, a FK restrict recusa (23503) → a tela oferece "Arquivar"
end $f$;

create or replace function public.kpis_meta_antes() returns trigger language plpgsql security definer set search_path = public as $f$
declare v_freq text; v_sentido text; v_inicio date;
begin
  -- Realinhamento pedido pelo gatilho do indicador (trocou a frequência ou o início): só a vigência
  -- anda; meta, limite e quem a pôs ficam. A marca só existe dentro dessa transação, e o navegador
  -- nem tem GRANT para mudar vale_desde.
  if tg_op = 'UPDATE' and coalesce(current_setting('kpis.realinhando', true), '') = 'sim' then
    new.indicador_id := old.indicador_id; new.meta := old.meta; new.limite_alerta := old.limite_alerta;
    new.por := old.por; new.em := old.em;
    return new;
  end if;
  if not public.kpis_administra() then
    raise exception 'KPIS_SEM_ACESSO' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then new.indicador_id := old.indicador_id; new.vale_desde := old.vale_desde; end if;
  select i.frequencia, i.sentido, i.inicio into v_freq, v_sentido, v_inicio from public.kpis_indicador i where i.id = new.indicador_id;
  new.vale_desde := public.kpis_inicio_periodo(v_freq, coalesce(new.vale_desde, v_inicio));
  if new.limite_alerta is not null and ((v_sentido = 'maior' and new.limite_alerta > new.meta)
                                     or (v_sentido = 'menor' and new.limite_alerta < new.meta)) then
    raise exception 'KPIS_LIMITE_DO_LADO_ERRADO: o "fica amarelo até" tem de ficar do lado de fora da meta.' using errcode = 'P0001';
  end if;
  new.por := auth.uid(); new.em := clock_timestamp();
  return new;
end $f$;

create or replace function public.kpis_lancamento_antes() returns trigger language plpgsql security definer set search_path = public as $f$
declare v_freq text; v_inicio date;
begin
  if tg_op = 'DELETE' then
    insert into public.kpis_lancamento_hist (lancamento_id, indicador_id, periodo, acao, valor_antes, comentario_antes, por)
    values (old.id, old.indicador_id, old.periodo, 'apagou', old.valor, old.comentario, auth.uid());
    return old;
  end if;
  if tg_op = 'INSERT' then
    -- ANTES de qualquer outra resposta: sem acesso, nada é revelado (nem início, nem tipo). Quem VÊ o
    -- indicador recebe o motivo de verdade (calculado ou arquivado) — isso ele já enxerga na tela.
    if not public.kpis_posso_lancar(new.indicador_id) then
      if public.kpis_vejo_indicador(new.indicador_id) then
        if exists (select 1 from public.kpis_indicador i where i.id = new.indicador_id and i.tipo = 'calculado') then
          raise exception 'KPIS_CALCULADO: este indicador é calculado pelas atividades; não se lança à mão.' using errcode = 'P0001';
        end if;
        if exists (select 1 from public.kpis_indicador i where i.id = new.indicador_id and not i.ativo) then
          raise exception 'KPIS_ARQUIVADO: este indicador está arquivado.' using errcode = 'P0001';
        end if;
      end if;
      raise exception 'KPIS_SEM_ACESSO' using errcode = '42501';
    end if;
  else
    new.id := old.id; new.indicador_id := old.indicador_id; new.periodo := old.periodo;
    new.lancado_por := old.lancado_por; new.lancado_em := old.lancado_em;
  end if;
  select i.frequencia, i.inicio into v_freq, v_inicio from public.kpis_indicador i where i.id = new.indicador_id;
  if tg_op = 'INSERT' then
    new.periodo := public.kpis_inicio_periodo(v_freq, new.periodo);
    if new.periodo > public.kpis_inicio_periodo(v_freq, public.kpis_hoje()) then
      raise exception 'KPIS_PERIODO_FUTURO: este período ainda não começou.' using errcode = 'P0001'; end if;   -- hoje = Joinville
    if new.periodo < v_inicio then
      raise exception 'KPIS_ANTES_DO_INICIO: este período é anterior ao início do indicador.' using errcode = 'P0001'; end if;
    new.lancado_por := auth.uid(); new.lancado_em := clock_timestamp(); new.alterado_por := null; new.alterado_em := null;
  elsif new.valor is distinct from old.valor or new.comentario is distinct from old.comentario then
    if new.valor is distinct from old.valor and length(btrim(coalesce(new.motivo, ''))) < 3 then
      raise exception 'KPIS_MOTIVO: diga por que o valor mudou.' using errcode = 'P0001'; end if;
    if length(new.motivo) > 300 then
      raise exception 'KPIS_MOTIVO_LONGO: o motivo vai até 300 letras.' using errcode = 'P0001'; end if;
    insert into public.kpis_lancamento_hist (lancamento_id, indicador_id, periodo, acao, valor_antes, valor_depois, comentario_antes, motivo, por)
    values (old.id, old.indicador_id, old.periodo, 'corrigiu', old.valor, new.valor, old.comentario, nullif(btrim(new.motivo), ''), auth.uid());
    new.alterado_por := auth.uid(); new.alterado_em := clock_timestamp();
  end if;
  new.comentario := nullif(btrim(new.comentario), '');
  new.motivo := null;                      -- o motivo mora só no histórico
  new.atualizado_em := clock_timestamp();
  return new;
end $f$;
-- Se a política recusar o UPDATE/DELETE depois do gatilho, o comando inteiro volta: a linha do histórico some junto.

drop trigger if exists kpis_indicador_antes on public.kpis_indicador;
create trigger kpis_indicador_antes before insert or update on public.kpis_indicador for each row execute function public.kpis_indicador_antes();
drop trigger if exists kpis_indicador_depois on public.kpis_indicador;
create trigger kpis_indicador_depois after update of frequencia, inicio on public.kpis_indicador for each row execute function public.kpis_indicador_depois();
drop trigger if exists kpis_indicador_antes_apagar on public.kpis_indicador;
create trigger kpis_indicador_antes_apagar before delete on public.kpis_indicador for each row execute function public.kpis_indicador_antes_apagar();
drop trigger if exists kpis_meta_antes on public.kpis_meta;
create trigger kpis_meta_antes before insert or update on public.kpis_meta for each row execute function public.kpis_meta_antes();
drop trigger if exists kpis_lancamento_antes on public.kpis_lancamento;
create trigger kpis_lancamento_antes before insert or update or delete on public.kpis_lancamento for each row execute function public.kpis_lancamento_antes();

-- 6) RLS e GRANT ----------------------------------------------------------------------------------------
alter table public.kpis_indicador enable row level security;
alter table public.kpis_meta enable row level security;
alter table public.kpis_lancamento enable row level security;
alter table public.kpis_lancamento_hist enable row level security;

-- tira TRUNCATE/REFERENCES/TRIGGER do padrão do Supabase
revoke all on public.kpis_indicador, public.kpis_meta, public.kpis_lancamento, public.kpis_lancamento_hist from public, anon, authenticated;
revoke all on sequence public.kpis_lancamento_hist_id_seq from public, anon, authenticated;

grant select, delete on public.kpis_indicador to authenticated;
grant insert (setor, nome, descricao, unidade, casas, sentido, frequencia, consolidacao, prazo_dias, inicio, ativo, tipo, calc_tipos, calc_medida, calc_escopo),
      update (setor, nome, descricao, unidade, casas, sentido, frequencia, consolidacao, prazo_dias, inicio, ativo, tipo, calc_tipos, calc_medida, calc_escopo)
   on public.kpis_indicador to authenticated;
grant select, delete on public.kpis_meta to authenticated;
grant insert (indicador_id, vale_desde, meta, limite_alerta), update (meta, limite_alerta) on public.kpis_meta to authenticated;
grant select, delete on public.kpis_lancamento to authenticated;
grant insert (indicador_id, periodo, valor, comentario), update (valor, comentario, motivo) on public.kpis_lancamento to authenticated;
grant select on public.kpis_lancamento_hist to authenticated;
grant all on public.kpis_indicador, public.kpis_meta, public.kpis_lancamento, public.kpis_lancamento_hist to service_role;
-- Sem "id", "lancado_por" nem "periodo" no UPDATE: não há upsert do PostgREST. O serviço faz insert;
-- 23505 → relê e oferece "Corrigir".

drop policy if exists kpis_indicador_ler    on public.kpis_indicador;
drop policy if exists kpis_indicador_criar  on public.kpis_indicador;
drop policy if exists kpis_indicador_editar on public.kpis_indicador;
drop policy if exists kpis_indicador_apagar on public.kpis_indicador;
drop policy if exists kpis_meta_ler    on public.kpis_meta;
drop policy if exists kpis_meta_criar  on public.kpis_meta;
drop policy if exists kpis_meta_editar on public.kpis_meta;
drop policy if exists kpis_meta_apagar on public.kpis_meta;
drop policy if exists kpis_lancamento_ler    on public.kpis_lancamento;
drop policy if exists kpis_lancamento_criar  on public.kpis_lancamento;
drop policy if exists kpis_lancamento_editar on public.kpis_lancamento;
drop policy if exists kpis_lancamento_apagar on public.kpis_lancamento;
drop policy if exists kpis_hist_ler on public.kpis_lancamento_hist;

create policy kpis_indicador_ler    on public.kpis_indicador for select to authenticated
  using ((select public.kpis_ve_todos()) or public.kpis_setor_chave(setor) = (select public.kpis_meu_setor()));
create policy kpis_indicador_criar  on public.kpis_indicador for insert to authenticated with check ((select public.kpis_administra()));
create policy kpis_indicador_editar on public.kpis_indicador for update to authenticated using ((select public.kpis_administra())) with check ((select public.kpis_administra()));
create policy kpis_indicador_apagar on public.kpis_indicador for delete to authenticated using ((select public.kpis_administra()));
create policy kpis_meta_ler    on public.kpis_meta for select to authenticated
  using (exists (select 1 from public.kpis_indicador i where i.id = kpis_meta.indicador_id));   -- a RLS do indicador vale dentro
create policy kpis_meta_criar  on public.kpis_meta for insert to authenticated with check ((select public.kpis_administra()));
create policy kpis_meta_editar on public.kpis_meta for update to authenticated using ((select public.kpis_administra())) with check ((select public.kpis_administra()));
create policy kpis_meta_apagar on public.kpis_meta for delete to authenticated using ((select public.kpis_administra()));
create policy kpis_lancamento_ler    on public.kpis_lancamento for select to authenticated
  using (exists (select 1 from public.kpis_indicador i where i.id = kpis_lancamento.indicador_id));
create policy kpis_lancamento_criar  on public.kpis_lancamento for insert to authenticated with check (public.kpis_posso_lancar(indicador_id));
create policy kpis_lancamento_editar on public.kpis_lancamento for update to authenticated
  using (public.kpis_posso_lancar(indicador_id)) with check (public.kpis_posso_lancar(indicador_id));
create policy kpis_lancamento_apagar on public.kpis_lancamento for delete to authenticated using ((select public.kpis_administra()));   -- quem é do setor CORRIGE (com motivo)
create policy kpis_hist_ler on public.kpis_lancamento_hist for select to authenticated
  using (exists (select 1 from public.kpis_indicador i where i.id = kpis_lancamento_hist.indicador_id));
-- O visualizador cai fora de todas: kpis_meu_setor() é null e kpis_ve_todos() é false.
-- O desligado também: kpis_cadastrado() é false. Nenhuma tabela kpis_ entra no Realtime.

-- 7) A LIGAÇÃO COM O OKR — SÓ LEITURA ----------------------------------------------------------------------
-- [{dono, id, de, ate}] (no máximo 500) → o valor de cada KR ligado. Três travas:
--   (1) quem pede lê aquele OKR (as MESMAS funções das políticas do okr_state); o servidor pula só esta;
--   (2) o kpiId está mesmo naquele OKR — e, para quem NÃO enxerga o indicador (o visualizador), num KR
--       cujo início e prazo são exatamente os pedidos (a mesma régua do cliente: o texto gravado, ''
--       quando falta); esse leitor também não recebe o nome do indicador;
--   (3) o DONO do OKR enxerga o indicador (dono desligado não enxerga).
-- 'ultimo' = o último valor com período entre o início do KR (se válido) e o prazo (se válido);
-- 'soma'   = a soma dos períodos que começam entre o início e o prazo (sem os dois: nulo).
-- Indicador calculado: os mesmos, sobre a série das atividades (período sem atividade = 0).
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

-- 8) EXECUTE -----------------------------------------------------------------------------------------------
revoke all on function public.kpis_hoje(), public.kpis_setor_chave(text), public.kpis_inicio_periodo(text, date),
  public.kpis_fim_periodo(text, date), public.kpis_proximo_periodo(text, date), public.kpis_data_ou_nulo(text),
  public.kpis_cadastrado(), public.kpis_visualizador(), public.kpis_administra(), public.kpis_ve_todos(), public.kpis_meu_setor(),
  public.kpis_posso_lancar(uuid), public.kpis_pode_lancar(public.kpis_indicador), public.kpis_vejo_indicador(uuid),
  public.kpis_dono_ve(text, text), public.kpis_calc_interno(uuid, date, date), public.kpis_serie_calculada(uuid, date, date),
  public.kpis_meu_acesso(), public.kpis_setores(), public.kpis_tipos_atividade(), public.kpis_valores_ligados(jsonb)
  from public, anon;
-- as de regra e as que a tela chama (várias rodam DENTRO das políticas: precisam de EXECUTE)
grant execute on function public.kpis_hoje(), public.kpis_setor_chave(text), public.kpis_inicio_periodo(text, date),
  public.kpis_fim_periodo(text, date), public.kpis_proximo_periodo(text, date), public.kpis_data_ou_nulo(text),
  public.kpis_cadastrado(), public.kpis_visualizador(), public.kpis_administra(), public.kpis_ve_todos(), public.kpis_meu_setor(),
  public.kpis_posso_lancar(uuid), public.kpis_pode_lancar(public.kpis_indicador), public.kpis_vejo_indicador(uuid),
  public.kpis_serie_calculada(uuid, date, date), public.kpis_meu_acesso(), public.kpis_setores(), public.kpis_tipos_atividade(),
  public.kpis_valores_ligados(jsonb)
  to authenticated, service_role;
-- só por dentro (quem chama já conferiu): o navegador NÃO executa
revoke all on function public.kpis_dono_ve(text, text), public.kpis_calc_interno(uuid, date, date) from authenticated;
grant execute on function public.kpis_dono_ve(text, text), public.kpis_calc_interno(uuid, date, date) to service_role;
revoke all on function public.kpis_indicador_antes(), public.kpis_indicador_antes_apagar(), public.kpis_indicador_depois(),
  public.kpis_meta_antes(), public.kpis_lancamento_antes() from public, anon, authenticated;

-- 9) TRAVA FINAL — as regras das vizinhas continuam valendo; se não, NADA fica gravado ----------------------
do $$ begin
  -- 022: nenhuma função do navegador devolve algo com "users" no tipo
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%'
              and pg_get_function_result(p.oid) ilike '%users%'
              and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))) then
    raise exception 'KPIS 023: função kpis_ devolveria users ao navegador. Nada foi criado.';
  end if;
  -- 021: função que cita okr_state e o navegador executa tem de ser SECURITY DEFINER
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and not p.prosecdef
              and pg_get_functiondef(p.oid) ilike '%okr_state%'
              and has_function_privilege('authenticated', p.oid, 'EXECUTE')) then
    raise exception 'KPIS 023: função kpis_ cita okr_state sem SECURITY DEFINER. Nada foi criado.';
  end if;
  -- anônimo não executa nada kpis_; o navegador não grava o histórico nem forja autor
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and has_function_privilege('anon', p.oid, 'EXECUTE'))
     or has_table_privilege('authenticated', 'public.kpis_lancamento_hist', 'INSERT')
     or has_column_privilege('authenticated', 'public.kpis_lancamento', 'lancado_por', 'INSERT')
     or has_function_privilege('authenticated', 'public.kpis_dono_ve(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpis_calc_interno(uuid, date, date)', 'EXECUTE')
     or exists (select 1 from pg_publication_tables where tablename like 'kpis\_%') then
    raise exception 'KPIS 023: privilégio fora do esperado. Nada foi criado.';
  end if;
  -- as funções kpi_ das vizinhas continuam de pé
  if to_regprocedure('public.kpi_desligar_usuario(uuid, date)') is null
     or not exists (select 1 from pg_proc where proname = 'kpi_rename_login') then
    raise exception 'KPIS 023: kpi_desligar_usuario ou kpi_rename_login sumiu. Nada foi criado.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';   -- 'reload config' não basta

-- 10) CONFERÊNCIA (só lê; só sim/não, contagens e datas). Esperado na linha:
--   4 · 13 · false · false · false · false · false · 0 · false · 0 · true · true · 2026-09-28 · 2026-10-01
select
  (select count(*) from pg_class where relname in ('kpis_indicador', 'kpis_meta', 'kpis_lancamento', 'kpis_lancamento_hist') and relrowsecurity) as rls_ligada,
  (select count(*) from pg_policies where tablename like 'kpis\_%')                                              as politicas,
  has_table_privilege('anon', 'public.kpis_lancamento', 'SELECT')                                                as anonimo_le,
  has_table_privilege('authenticated', 'public.kpis_indicador', 'TRUNCATE')                                      as esvazia,
  has_column_privilege('authenticated', 'public.kpis_lancamento', 'lancado_por', 'INSERT')                      as forja_autor,
  has_column_privilege('authenticated', 'public.kpis_lancamento', 'periodo', 'UPDATE')                          as troca_periodo,
  has_table_privilege('authenticated', 'public.kpis_lancamento_hist', 'INSERT')                                  as escreve_hist,
  (select count(*) from pg_proc where proname like 'kpis\_%' and has_function_privilege('anon', oid, 'EXECUTE'))  as anonimo_executa,
  has_function_privilege('authenticated', 'public.kpis_dono_ve(text, text)', 'EXECUTE')                         as tela_dono_ve,
  (select count(*) from pg_publication_tables where tablename like 'kpis\_%')                                    as no_realtime,
  to_regprocedure('public.kpi_desligar_usuario(uuid, date)') is not null                                         as intacta_022,
  exists (select 1 from pg_proc where proname = 'kpi_rename_login')                                              as intacta_renomear,
  public.kpis_inicio_periodo('semanal', date '2026-10-01')                                                       as semana,
  public.kpis_inicio_periodo('trimestral', date '2026-11-15')                                                    as trimestre;
