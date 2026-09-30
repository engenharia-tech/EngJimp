-- =====================================================================================================
-- 022 — DESLIGAR SEM EXCLUIR + CUSTO/HORA POR PERÍODO ("congelar cada mês") — 30/09/2026
--
-- Decisões do Edson, 30/09/2026:
--  1) Quem sai da empresa é DESLIGADO, não excluído: o cadastro e tudo o que a pessoa fez ficam no nome
--     dela; do dia seguinte ao último dia em diante, sem login e fora do custo. Desliga o Edson ou um GESTOR.
--  2) "meu salário deve sair no mês de setembro já": o salário do Edson sai do custo/hora da engenharia a
--     partir de 01/09/2026 (ele agora é só P&D; as HORAS dele já saem desde 01/09, src/utils/pndSplit.ts).
--  3) "Congelar cada mês": janeiro a agosto valem o que valem hoje; setembro em diante sem o Edson; quem
--     for desligado sai do custo no dia seguinte ao último dia (o Rogerio Sinotti: último dia sexta 02/10).
--  4) R$ só para o Edson e para os CEOs (o servidor decide; a série não sai do banco para mais ninguém).
--  6) Nenhuma taxa ou salário aparece em conferência, log, commit ou documento.
--
-- Antes: GET /api/labor/hourly-cost calculava UMA média com os salários ATUAIS (quem não é CEO, PROCESSOS
--   nem ADM_EXTERNO e tem salário > 0, dividido pelo número de pessoas e por 220 h) e o app aplicava essa
--   média a TODOS os registros, de qualquer data: tirar alguém da média mudava o custo de janeiro.
-- Agora:
--   a) users.desligado_em = último dia trabalhado (inclusive). Nulo = ativo. A tela LÊ esta coluna
--      (seletores e divisores precisam da data); nada de salário nela.
--      users.custo_ate = último dia em que o salário entra na média. SÓ o servidor lê (sem grant).
--   b) custo_hora_periodo(area, desde, taxa, motivo, gravado_em): a taxa que vale A PARTIR de cada data
--      (até a véspera da próxima linha). SÓ o servidor (service_role) lê e grava: RLS ligada, sem grant.
--   c) custo_hora_taxa_calculada(dia, area): a regra de sempre (a mesma de api/index.ts até 30/09), com quem
--      tem custo_ate antes do dia fora da média. É o ÚNICO lugar da regra "quem entra na média" — o pedido
--      futuro do KPI por área mexe aqui (a assinatura já leva a área; hoje só 'engenharia' tem regra).
--   d) custo_hora_recalcular(desde, motivo, area): refaz a série do dia pedido em diante, NUNCA antes do
--      1º dia do mês corrente (mês fechado não muda). Linha nova só nasce se a taxa mudou; linha que ficou
--      igual à anterior sai (o valor de cada dia não muda).
--   e) GATILHO em users (por comando, depois de INSERT, DELETE ou UPDATE de salário, cargo ou custo_ate):
--      recalcula do dia de hoje em diante. Assim, cadastro mexido pela tela OU pelo SQL Editor (como a
--      Patrícia e o Julio em 29/09) nunca deixa a série para trás. Um aumento vale do dia em que é salvo.
--   f) kpi_desligar_usuario(id, último dia): desliga numa transação só — datas, senha aleatória que ninguém
--      conhece, e-mail fora, códigos zerados — e recalcula o custo a partir do dia seguinte (nunca antes do
--      mês corrente). Quem chama é POST /api/users/desligar (Edson ou GESTOR; último dia até hoje).
--   g) SEMENTE, calculada aqui dentro e nunca mostrada (só numa instalação NOVA — série vazia):
--        desde 2000-01-01 = a regra de antes, COM o Edson (é o número que a tela usa hoje para tudo:
--                           jan–ago não mudam);
--        desde 2026-09-01 = sem o Edson (custo_ate dele = 31/08/2026);
--        e, para quem JÁ tiver custo_ate (só acontece depois de um desfazer), uma linha no dia seguinte.
--      O Rogerio Sinotti É gravado aqui (passo 4b, correção de 30/09): desligado_em = custo_ate = 02/10/2026
--      → a semente já nasce com a linha de 2026-10-03, sem ele. Senão outubro ficaria com o salário dele se
--      ninguém apertasse "Desligar" na sexta. A senha e o e-mail dele saem na sexta pela 020.
--   h) O Log de Auditoria perde os valores de custo/hora que a tela de Configurações gravava ("Custo Hora
--      (ex: …, novo: …)" vira "Custo Hora (alterado)"), como a 019 fez com o salário: com médias de datas
--      diferentes dava para deduzir o salário de quem entrou ou saiu.
-- Travas: o Edson é achado pelo id (exatamente 1). Se o navegador conseguir ler custo_ate, salário, a série
--   ou a cópia guardada por um desfazer, executar as funções, ou se houver função que devolva a linha
--   inteira de users executável pelo navegador, é erro e NADA é gravado (tudo numa transação).
--
-- ORDEM (colunas, tabela e funções NOVAS: o BANCO vem ANTES do código):
--   0) Rodar ANTES de qualquer alteração de salário no dia: a semente de 2000-01-01 é o cadastro do dia em
--      que a 022 roda (é ela que congela jan–ago).
--   1) Supabase → SQL Editor: rodar ESTE arquivo inteiro. As duas consultas do fim mostram SÓ datas,
--      contagens e sim/não. Esperado numa instalação nova:
--        7a (série):    2000-01-01 · true · true · N   |   2026-09-01 · true · true · N-1   |   2026-10-03 · true · true · N-2
--        7b (cadastro): 2026-08-31 · 2026-10-02 · 1 · true · false · false · false · false · false · false ·
--                       true · true · false · false · false · 0 · 0
--      (N = pessoas na média hoje. Se a 2ª linha da 7a disser "mudou = false", o Edson não estava na
--       média — mande o print antes de publicar. Se "users_no_realtime" der true, mande o print também.)
--   2) Só então o push do código (com o OK do Edson) → deploy Ready → Ctrl+Shift+R.
--   3) Depois do código no ar e do Ctrl+Shift+R de todos, se a última coluna da 7b ("custo_hora_no_log")
--      voltar > 0 (uma aba com o pacote antigo gravou de novo), rodar este arquivo de novo: na 2ª vez ele
--      só limpa o log (o resto não muda).
--   4) Sexta 02/10, fim do expediente: a 020 (senha aleatória, e-mail fora). As datas já estão gravadas aqui.
--   ⚠ O SQL Editor mostra só a ÚLTIMA consulta (7b). A 7a pode ser rodada sozinha depois (só lê).
-- Pode rodar de novo: nada é reescrito — a série só é semeada (ou restaurada) quando está vazia, as datas
--   do Edson só são gravadas se ainda estiverem vazias (ou iguais) e o gatilho é refeito.
-- Desfazer: 022_rollback.sql. Ele NÃO apaga a série: renomeia para custo_hora_periodo_rollback_AAAAMMDD e
--   guarda id/desligado_em/custo_ate em users_desligamento_rollback_AAAAMMDD (as duas sem grant). Rodar a
--   022 de novo depois disso RESTAURA delas (jan–ago continuam os de antes). ⚠ Se essas cópias forem
--   apagadas, a 022 semeia de novo com os salários DAQUELE dia — e jan–ago mudam. A senha de quem foi
--   desligado NÃO volta (a tela de Equipe dá outra) e o log limpo também não (a cópia de segurança o tem).
-- Ensaio: bancada PGlite (Postgres de verdade em memória, salários FICTÍCIOS) — ver o commit.
-- =====================================================================================================

begin;

set local search_path = public, extensions;

-- O gatilho sai durante a migração e volta no fim (item 6): senão, rodar de novo dispararia um recálculo
-- no meio da semente.
drop trigger if exists custo_hora_segue_o_cadastro on public.users;

-- ---------------------------------------------------------------------------------------------------
-- 1) As duas datas no cadastro
-- ---------------------------------------------------------------------------------------------------
alter table public.users add column if not exists desligado_em date;
alter table public.users add column if not exists custo_ate    date;

comment on column public.users.desligado_em is
  '022 (30/09/2026): último dia trabalhado (inclusive). Nulo = ativo. Do dia seguinte em diante: sem login, fora dos seletores e dos divisores; o cadastro e o histórico ficam no nome da pessoa.';
comment on column public.users.custo_ate is
  '022 (30/09/2026): último dia em que o salário entra na média do custo/hora. Nulo = entra. Só o servidor lê.';

-- Desligado sem data de custo, ou custo depois do desligamento, não existe.
alter table public.users drop constraint if exists users_custo_ate_ate_desligado;
alter table public.users add constraint users_custo_ate_ate_desligado
  check (desligado_em is null or (custo_ate is not null and custo_ate <= desligado_em));

-- A tela lê desligado_em (grant de COLUNA, como a 005). custo_ate fica sem grant: coluna nova nasce
-- invisível para quem só tem SELECT por coluna.
grant select (desligado_em) on public.users to authenticated;

-- ---------------------------------------------------------------------------------------------------
-- 2) A série: a taxa que vale a partir de cada data
-- ---------------------------------------------------------------------------------------------------
create table if not exists public.custo_hora_periodo (
  area       text        not null default 'engenharia',
  desde      date        not null,
  taxa       numeric     not null check (taxa >= 0),
  motivo     text,
  gravado_em timestamptz not null default pg_catalog.now(),
  primary key (area, desde)
);

comment on table public.custo_hora_periodo is
  '022 (30/09/2026): custo/hora POR PERÍODO — a linha vale de "desde" até a véspera da próxima. Só o servidor (service_role) lê e grava. Nunca reescrever linha de mês fechado.';

alter table public.custo_hora_periodo enable row level security;
-- Nenhuma política: com a RLS ligada, só a service_role enxerga. E sem grant (o Supabase dá ALL de
-- tabela nova a anon/authenticated por padrão: tirar explicitamente).
revoke all on table public.custo_hora_periodo from public, anon, authenticated;
grant select, insert, update, delete on table public.custo_hora_periodo to service_role;

-- ---------------------------------------------------------------------------------------------------
-- 3) As funções (todas SÓ para a service_role)
-- ---------------------------------------------------------------------------------------------------

-- Assinaturas de um ensaio anterior (sem a área): se existirem, sairiam ambíguas com as de agora.
drop function if exists public.custo_hora_taxa_calculada(date);
drop function if exists public.custo_hora_recalcular(date, text);

-- O dia de Joinville. Separada para a bancada de teste poder fixar "hoje".
create or replace function public.custo_hora_hoje()
returns date
language sql
stable
set search_path = ''
as $f$ select (pg_catalog.now() at time zone 'America/Sao_Paulo')::date $f$;

-- A REGRA de quem entra na média — a mesma de api/index.ts (GET /api/labor/hourly-cost até 30/09/2026):
-- cargo diferente de CEO, PROCESSOS e ADM_EXTERNO (cargo vazio ENTRA, como no JS), salário > 0,
-- e agora: custo_ate vazio ou >= o dia (o último dia ainda conta). Média mensal ÷ 220 h. Ninguém na
-- média = 0. Só a engenharia tem regra (decisão do Edson, 30/09: o KPI por área é o próximo pedido).
create or replace function public.custo_hora_taxa_calculada(p_dia date, p_area text default 'engenharia')
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $f$
declare
  v numeric;
begin
  if p_dia is null then raise exception 'CUSTO_DIA: informe o dia'; end if;
  if coalesce(nullif(pg_catalog.btrim(p_area), ''), 'engenharia') <> 'engenharia' then
    raise exception 'CUSTO_AREA: só a engenharia tem regra de custo/hora (022)';
  end if;
  select coalesce(sum(u.salary) / nullif(count(*), 0) / 220, 0) into v
    from public.users u
   where coalesce(u.role, '') not in ('CEO', 'PROCESSOS', 'ADM_EXTERNO')
     and coalesce(u.salary, 0) > 0
     and (u.custo_ate is null or u.custo_ate >= p_dia);
  return v;
end
$f$;

-- Refaz a série de p_desde (nulo = hoje) em diante — nunca antes do 1º dia do mês corrente. Para cada
-- data de corte (p_desde, cada custo_ate + 1 depois dele e cada linha que já existe depois dele):
-- linha existente é recalculada; linha nova só nasce se a taxa mudou em relação à vigente (salvar o
-- cadastro sem mudar salário/cargo não cria linha). No fim, linha do dia pedido em diante que ficou
-- igual à anterior sai (o valor de cada dia continua o mesmo). Devolve quantas linhas mudaram (nunca
-- uma taxa).
create or replace function public.custo_hora_recalcular(p_desde date, p_motivo text, p_area text default 'engenharia')
returns integer
language plpgsql
security definer
set search_path = ''
as $f$
declare
  v_area    text := coalesce(nullif(pg_catalog.btrim(p_area), ''), 'engenharia');
  v_hoje    date := public.custo_hora_hoje();
  v_piso    date := pg_catalog.make_date(pg_catalog.date_part('year', v_hoje)::int, pg_catalog.date_part('month', v_hoje)::int, 1);
  v_desde   date := greatest(coalesce(p_desde, v_hoje), v_piso);
  v_motivo  text := pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_motivo), ''), 'recalculo'), 200);
  v_dia     date;
  v_taxa    numeric;
  v_vigente numeric;
  v_k       integer;
  v_n       integer := 0;
begin
  if v_area <> 'engenharia' then
    raise exception 'CUSTO_AREA: só a engenharia tem regra de custo/hora (022)';
  end if;
  -- Dois cadastros salvos ao mesmo tempo não recalculam por cima um do outro.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.custo_hora_periodo:' || v_area));
  for v_dia in
    select x.d from (
      select v_desde as d
      union
      select u.custo_ate + 1 from public.users u
       where u.custo_ate is not null and u.custo_ate + 1 > v_desde
      union
      select p.desde from public.custo_hora_periodo p
       where p.area = v_area and p.desde > v_desde
    ) x
    order by x.d
  loop
    v_taxa := public.custo_hora_taxa_calculada(v_dia, v_area);
    if exists (select 1 from public.custo_hora_periodo p where p.area = v_area and p.desde = v_dia) then
      update public.custo_hora_periodo p
         set taxa = v_taxa, motivo = v_motivo, gravado_em = pg_catalog.now()
       where p.area = v_area and p.desde = v_dia and p.taxa is distinct from v_taxa;
      get diagnostics v_k = row_count;
      v_n := v_n + v_k;
    else
      v_vigente := null;
      select p.taxa into v_vigente
        from public.custo_hora_periodo p
       where p.area = v_area and p.desde < v_dia
       order by p.desde desc
       limit 1;
      if v_vigente is distinct from v_taxa then
        insert into public.custo_hora_periodo (area, desde, taxa, motivo)
        values (v_area, v_dia, v_taxa, v_motivo);
        v_n := v_n + 1;
      end if;
    end if;
  end loop;
  -- Linha (do dia pedido em diante, nunca de mês fechado) igual à anterior não diz nada: sai.
  delete from public.custo_hora_periodo p
   using (select q.desde, q.taxa, lag(q.taxa) over (order by q.desde) as ant
            from public.custo_hora_periodo q
           where q.area = v_area) x
   where p.area = v_area and p.desde = x.desde and x.desde >= v_desde and x.ant = x.taxa;
  get diagnostics v_k = row_count;
  v_n := v_n + v_k;
  return v_n;
end
$f$;

-- O gatilho de users: cadastro mudou (pessoa entrou ou saiu, salário, cargo, custo_ate) → a série segue,
-- de hoje em diante. Por COMANDO (uma vez por UPDATE, não por linha). Não mexe em users: sem laço.
create or replace function public.custo_hora_gatilho_users()
returns trigger
language plpgsql
security definer
set search_path = ''
as $f$
begin
  perform public.custo_hora_recalcular(null, 'cadastro alterado (' || pg_catalog.lower(tg_op) || ')', 'engenharia');
  return null;
end
$f$;

-- Desliga UMA pessoa (quem chama é POST /api/users/desligar, que confere Edson/GESTOR). Tudo numa
-- transação: último dia, custo_ate (o menor entre o que já havia e o último dia), senha aleatória que
-- ninguém conhece (hash e texto), e-mail fora do cadastro, códigos zerados; depois recalcula o custo a
-- partir do dia seguinte (nunca antes do mês corrente). Recusa (exceção com código, sem valores):
-- DESLIGAR_DADOS, DESLIGAR_EDSON, DESLIGAR_FUTURO, DESLIGAR_DATA, DESLIGAR_NAO_ACHEI, DESLIGAR_JA_DESLIGADO.
-- O crypt()/gen_salt() do Supabase moram em "extensions" (a mesma receita da 020).
create or replace function public.kpi_desligar_usuario(p_user uuid, p_ultimo_dia date)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $f$
declare
  v_hoje       date := public.custo_hora_hoje();
  v_piso       date;
  v_ja         date;
  v_achou      boolean;
  v_email_nulo boolean;
  v_custo_ate  date;
  v_linhas     integer;
begin
  if p_user is null or p_ultimo_dia is null then raise exception 'DESLIGAR_DADOS'; end if;
  if p_user = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid then raise exception 'DESLIGAR_EDSON'; end if;
  if p_ultimo_dia > v_hoje then raise exception 'DESLIGAR_FUTURO'; end if;
  if p_ultimo_dia < date '2026-01-01' then raise exception 'DESLIGAR_DATA'; end if;
  v_piso := make_date(date_part('year', v_hoje)::int, date_part('month', v_hoje)::int, 1);

  select true, u.desligado_em into v_achou, v_ja from public.users u where u.id = p_user for update;
  if v_achou is null then raise exception 'DESLIGAR_NAO_ACHEI'; end if;
  if v_ja is not null then raise exception 'DESLIGAR_JA_DESLIGADO'; end if;

  select c.is_nullable = 'YES' into v_email_nulo
    from information_schema.columns c
   where c.table_schema = 'public' and c.table_name = 'users' and c.column_name = 'email';

  update public.users u
     set desligado_em       = p_ultimo_dia,
         custo_ate          = least(coalesce(u.custo_ate, p_ultimo_dia), p_ultimo_dia),
         password_hash      = crypt(gen_random_uuid()::text || clock_timestamp()::text, gen_salt('bf')),
         password           = gen_random_uuid()::text,
         must_set_password  = false,
         reset_code_hash    = null,
         reset_code_expires = null,
         email              = case when coalesce(v_email_nulo, true) then null
                                   else 'desligado-' || u.id::text || '@desligado.invalid' end
   where u.id = p_user
  returning u.custo_ate into v_custo_ate;

  -- O gatilho já recalculou de hoje em diante; aqui vale o dia seguinte ao último, que pode ser antes de
  -- hoje (desligamento feito dias depois do último dia, dentro do mês corrente).
  v_linhas := public.custo_hora_recalcular(v_custo_ate + 1, 'desligamento pela tela de Equipe', 'engenharia');
  return jsonb_build_object('custo_desde', greatest(v_custo_ate + 1, v_piso), 'linhas', v_linhas);
end
$f$;

comment on function public.custo_hora_taxa_calculada(date, text) is
  '022 (30/09/2026): a regra de quem entra na média do custo/hora (ÚNICO lugar). EXECUTE só service_role.';
comment on function public.custo_hora_recalcular(date, text, text) is
  '022 (30/09/2026): refaz a série de custo/hora do dia pedido em diante, nunca antes do mês corrente. EXECUTE só service_role.';
comment on function public.custo_hora_gatilho_users() is
  '022 (30/09/2026): gatilho de users (por comando) — a série de custo/hora segue o cadastro, de hoje em diante.';
comment on function public.kpi_desligar_usuario(uuid, date) is
  '022 (30/09/2026): desliga sem excluir (datas, senha aleatória, e-mail fora, códigos zerados) e recalcula o custo. EXECUTE só service_role (POST /api/users/desligar).';

-- O Supabase dá EXECUTE de função nova a anon/authenticated por padrão: tirar dos dois explicitamente.
revoke all on function public.custo_hora_hoje()                          from public, anon, authenticated;
revoke all on function public.custo_hora_taxa_calculada(date, text)      from public, anon, authenticated;
revoke all on function public.custo_hora_recalcular(date, text, text)    from public, anon, authenticated;
revoke all on function public.custo_hora_gatilho_users()                 from public, anon, authenticated;
revoke all on function public.kpi_desligar_usuario(uuid, date)           from public, anon, authenticated;
grant execute on function public.custo_hora_hoje()                       to service_role;
grant execute on function public.custo_hora_taxa_calculada(date, text)   to service_role;
grant execute on function public.custo_hora_recalcular(date, text, text) to service_role;
grant execute on function public.kpi_desligar_usuario(uuid, date)        to service_role;

-- ---------------------------------------------------------------------------------------------------
-- 4) O Edson (pelo id): fora da média a partir de 01/09/2026. NÃO é desligado. Trava: exatamente 1.
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  n int;
begin
  update public.users
     set custo_ate = date '2026-08-31'
   where id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid
     and (custo_ate is null or custo_ate = date '2026-08-31');
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '022: esperava 1 linha do Edson (pelo id), achei %. Nada foi gravado.', n;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------------
-- 4b) O Rogerio Sinotti (login rogerio, PROJETISTA — NÃO o rogerio.p de Suprimentos): desligado com último
--     dia 02/10/2026, fora da média a partir de 03/10. Decisão do Edson, 30/09 ("desligado na sexta … sair do
--     custo da engenharia a partir de sábado"), gravada JÁ (e não num clique na sexta), senão outubro ficaria
--     para sempre com o salário dele se ninguém apertasse Desligar. Só as datas: a senha e o e-mail saem na
--     sexta pela 020. O login recusa desligado só DEPOIS do último dia. Trava: exatamente 1.
--     (Ao rodar de novo: a linha já está com as mesmas datas e continua valendo.)
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  n int;
begin
  update public.users
     set custo_ate    = date '2026-10-02',
         desligado_em = date '2026-10-02'
   where lower(trim(username)) = 'rogerio'
     and role = 'PROJETISTA'
     and id <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid
     and (desligado_em is null or desligado_em = date '2026-10-02')
     and (custo_ate is null or custo_ate = date '2026-10-02');
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception '022: esperava 1 linha do Rogerio (login rogerio, PROJETISTA), achei %. Nada foi gravado.', n;
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------------
-- 5) SÓ numa instalação nova (série vazia): RESTAURA do que um desfazer guardou, se houver; senão,
--    SEMEIA — calculada aqui, nunca mostrada. Com a série já preenchida (rodar de novo), nada acontece.
-- ---------------------------------------------------------------------------------------------------
do $$
declare
  v_serie text;
  v_users text;
  v_tab   text;
begin
  -- As cópias de um desfazer nunca ficam legíveis pelo navegador: a cada rodada, o grant sai de todas
  -- (um grant dado à mão é consertado aqui; a trava do item 8 confere que saiu).
  for v_tab in
    select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where s.nspname = 'public' and c.relkind = 'r'
       and (c.relname ~ '^custo_hora_periodo_rollback_' or c.relname ~ '^users_desligamento_rollback_')
  loop
    execute format('revoke all on table public.%I from public, anon, authenticated', v_tab);
  end loop;

  if exists (select 1 from public.custo_hora_periodo where area = 'engenharia') then
    return;   -- rodando de novo: o passado não é reescrito
  end if;

  -- As cópias mais novas de um desfazer (022_rollback.sql): custo_hora_periodo_rollback_AAAAMMDD[_N].
  select c.relname into v_serie
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r'
     and c.relname ~ '^custo_hora_periodo_rollback_[0-9]{8}(_[0-9]+)?$'
   order by substring(c.relname from '_rollback_([0-9]{8})') desc,
            coalesce(substring(c.relname from '_rollback_[0-9]{8}_([0-9]+)$')::int, 1) desc
   limit 1;
  select c.relname into v_users
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind = 'r'
     and c.relname ~ '^users_desligamento_rollback_[0-9]{8}(_[0-9]+)?$'
   order by substring(c.relname from '_rollback_([0-9]{8})') desc,
            coalesce(substring(c.relname from '_rollback_[0-9]{8}_([0-9]+)$')::int, 1) desc
   limit 1;

  -- As datas de quem já tinha sido desligado voltam (só em quem está sem data agora).
  if v_users is not null then
    execute format(
      'update public.users u set desligado_em = b.desligado_em, custo_ate = b.custo_ate
         from public.%I b
        where b.id = u.id and u.desligado_em is null
          and (u.custo_ate is null or u.custo_ate = b.custo_ate)', v_users);
  end if;

  if v_serie is not null then
    -- A série congelada volta como estava: jan–ago (e cada mês fechado) não mudam.
    execute format(
      'insert into public.custo_hora_periodo (area, desde, taxa, motivo, gravado_em)
       select area, desde, taxa, motivo, gravado_em from public.%I
       on conflict (area, desde) do nothing', v_serie);
    return;
  end if;

  insert into public.custo_hora_periodo (area, desde, taxa, motivo) values
    ('engenharia', date '2000-01-01', public.custo_hora_taxa_calculada(date '2000-01-01', 'engenharia'),
     '022: a regra de antes, com o Edson — vale para tudo antes de 01/09/2026 (jan–ago não mudam)'),
    ('engenharia', date '2026-09-01', public.custo_hora_taxa_calculada(date '2026-09-01', 'engenharia'),
     '022: sem o salário do Edson (só P&D desde 01/09/2026) — decisão do Edson, 30/09')
  on conflict (area, desde) do nothing;

  -- Quem JÁ tem custo_ate (o Rogerio, se o desligamento dele já estiver gravado): sai no dia seguinte.
  insert into public.custo_hora_periodo (area, desde, taxa, motivo)
  select 'engenharia', x.d, public.custo_hora_taxa_calculada(x.d, 'engenharia'),
         '022: sem o salário de quem saiu no dia anterior (desligamento já gravado)'
    from (select distinct u.custo_ate + 1 as d from public.users u
           where u.custo_ate is not null and u.custo_ate + 1 > date '2026-09-01') x
  on conflict (area, desde) do nothing;
end
$$;

-- ---------------------------------------------------------------------------------------------------
-- 6) O gatilho volta (depois da semente): a série segue o cadastro, de hoje em diante.
-- ---------------------------------------------------------------------------------------------------
create trigger custo_hora_segue_o_cadastro
  after insert or delete or update of salary, role, custo_ate on public.users
  for each statement execute function public.custo_hora_gatilho_users();

-- ---------------------------------------------------------------------------------------------------
-- 7) O Log de Auditoria sem valor de custo/hora (como a 019 fez com o salário). Só registros de
--    Configurações; o resto do texto (quem, quando, o que mais mudou) fica.
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.audit_logs') is not null then
    update public.audit_logs
       set details = regexp_replace(details, 'Custo Hora \(ex: "[^"]*", novo: "[^"]*"\)', 'Custo Hora (alterado)', 'g')
     where entity_type = 'SETTINGS'
       and details ~ 'Custo Hora \(ex: "[^"]*", novo: "[^"]*"\)';
  end if;
end
$$;

-- ---------------------------------------------------------------------------------------------------
-- 8) Trava de privilégio: se o navegador conseguir ler custo_ate/salário, a série ou as cópias de um
--    desfazer, executar as funções, ou chamar função que devolve a linha inteira de users, NADA do que
--    está acima fica gravado.
-- ---------------------------------------------------------------------------------------------------
do $$
begin
  if has_column_privilege('authenticated', 'public.users', 'custo_ate', 'SELECT')
     or has_column_privilege('anon', 'public.users', 'custo_ate', 'SELECT')
     or has_column_privilege('authenticated', 'public.users', 'salary', 'SELECT')
     or has_column_privilege('anon', 'public.users', 'salary', 'SELECT')
     or not has_column_privilege('authenticated', 'public.users', 'desligado_em', 'SELECT')
  then
    raise exception '022: privilégio de coluna fora do esperado em users (o navegador leria custo_ate ou salário). Nada foi gravado — mande o print ao Claude.';
  end if;

  if has_table_privilege('authenticated', 'public.custo_hora_periodo', 'SELECT, INSERT, UPDATE, DELETE')
     or has_table_privilege('anon', 'public.custo_hora_periodo', 'SELECT, INSERT, UPDATE, DELETE')
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.custo_hora_periodo'::regclass)
     or exists (select 1 from pg_class c join pg_namespace s on s.oid = c.relnamespace
                 where s.nspname = 'public' and c.relkind = 'r'
                   and (c.relname ~ '^custo_hora_periodo_rollback_' or c.relname ~ '^users_desligamento_rollback_')
                   and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'SELECT')))
  then
    raise exception '022: a série de custo/hora (ou uma cópia dela) ficaria legível pelo navegador. Nada foi gravado — mande o print ao Claude.';
  end if;

  if has_function_privilege('authenticated', 'public.custo_hora_taxa_calculada(date, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.custo_hora_taxa_calculada(date, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.custo_hora_recalcular(date, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.custo_hora_recalcular(date, text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpi_desligar_usuario(uuid, date)', 'EXECUTE')
     or has_function_privilege('anon', 'public.kpi_desligar_usuario(uuid, date)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.kpi_desligar_usuario(uuid, date)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.custo_hora_recalcular(date, text, text)', 'EXECUTE')
  then
    raise exception '022: as funções do custo/hora ficariam fora do servidor (o navegador executaria, ou o servidor não). Nada foi gravado — mande o print ao Claude.';
  end if;

  -- Função que devolve a linha INTEIRA de users (ou algo com "users" no tipo de retorno) e que o
  -- navegador executa passaria a entregar custo_ate — e já entregaria o salário.
  if exists (select 1 from pg_proc p
              where (p.prorettype = 'public.users'::regtype
                     or (p.pronamespace = 'public'::regnamespace and pg_get_function_result(p.oid) ilike '%users%'))
                and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE')))
  then
    raise exception '022: há função executável pelo navegador que devolve a linha de users. Nada foi gravado — mande o print ao Claude.';
  end if;
end
$$;

commit;

-- Tabela, colunas e funções novas só aparecem na API com 'reload schema' ('reload config' não basta).
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------------------------------
-- 9) Conferência (só lê; SÓ datas, contagens e sim/não — nunca uma taxa ou salário)
-- ---------------------------------------------------------------------------------------------------
-- 7a) A série. Esperado numa instalação nova: 2000-01-01 · true · true · N | 2026-09-01 · true · true · N-1 | 2026-10-03 · true · true · N-2
--     (e, depois do desligamento do Rogerio na sexta: 2026-10-03 · true · true · N-2).
select p.desde,
       (p.taxa > 0) as taxa_positiva,
       (p.taxa is distinct from lag(p.taxa) over (order by p.desde)) as mudou,
       (select count(*) from public.users u
         where coalesce(u.role, '') not in ('CEO', 'PROCESSOS', 'ADM_EXTERNO')
           and coalesce(u.salary, 0) > 0
           and (u.custo_ate is null or u.custo_ate >= p.desde)) as pessoas_na_media
  from public.custo_hora_periodo p
 where p.area = 'engenharia'
 order by p.desde;

-- 7b) O cadastro e os privilégios. Esperado numa instalação nova: 2026-08-31 · 2026-10-02 · 1 · true ·
--     false · false · false · false · false · false · true · true · false · false · false · 0 · 0
select (select custo_ate from public.users where id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid) as edson_custo_ate,
       (select max(custo_ate) from public.users where lower(btrim(username)) = 'rogerio' and role = 'PROJETISTA') as rogerio_custo_ate,
       (select count(*) from public.users where desligado_em is not null) as desligados,
       has_column_privilege('authenticated', 'public.users', 'desligado_em', 'SELECT') as tela_le_desligado,
       has_column_privilege('authenticated', 'public.users', 'custo_ate', 'SELECT') as tela_le_custo_ate,
       has_table_privilege('authenticated', 'public.custo_hora_periodo', 'SELECT') as tela_le_serie,
       has_function_privilege('authenticated', 'public.custo_hora_taxa_calculada(date, text)', 'EXECUTE') as tela_calcula,
       has_function_privilege('authenticated', 'public.custo_hora_recalcular(date, text, text)', 'EXECUTE') as tela_recalcula,
       has_function_privilege('authenticated', 'public.kpi_desligar_usuario(uuid, date)', 'EXECUTE') as tela_desliga,
       has_function_privilege('anon', 'public.kpi_desligar_usuario(uuid, date)', 'EXECUTE') as anonimo_desliga,
       has_function_privilege('service_role', 'public.kpi_desligar_usuario(uuid, date)', 'EXECUTE') as servidor_desliga,
       (select c.relrowsecurity from pg_class c where c.oid = 'public.custo_hora_periodo'::regclass) as rls_serie,
       exists (select 1 from pg_publication_tables t where t.schemaname = 'public' and t.tablename = 'custo_hora_periodo') as serie_no_realtime,
       exists (select 1 from pg_publication_tables t where t.schemaname = 'public' and t.tablename = 'users') as users_no_realtime,
       not exists (select 1 from pg_trigger g where g.tgrelid = 'public.users'::regclass and g.tgname = 'custo_hora_segue_o_cadastro' and not g.tgisinternal) as sem_gatilho,
       (select count(*) from pg_proc p
         where (p.prorettype = 'public.users'::regtype
                or (p.pronamespace = 'public'::regnamespace and pg_get_function_result(p.oid) ilike '%users%'))
           and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))) as funcoes_que_devolvem_users,
       (select count(*) from public.audit_logs
         where entity_type = 'SETTINGS' and details ~ 'Custo Hora \(ex: "[^"]*", novo: "[^"]*"\)') as custo_hora_no_log;
