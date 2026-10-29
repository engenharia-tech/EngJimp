-- 035 — KPI: LANÇAMENTO DIÁRIO (29/10/2026). Edson (28/10): "Dentro dos indicadores da fábrica, o Leonardo, não tem a
-- opção de todo dia para que se feche no mês. Ele precisa lançar as produções diárias para que a meta mensal seja
-- alimentada todo dia … toda semana, todo mês e a cada trimestre, preciso que ajuste para todo dia." (29/10): "Preciso que
-- seja diária a escolha e você faça o fluxo para as entregas diárias. O qual vai alimentando as entregas mensais."
--
-- O desenho: a FREQUÊNCIA continua sendo o período da META (semana, mês ou trimestre — as funções de período e o CHECK
-- ficam como estão). "Todo dia" é o jeito de LANÇAR: o indicador ganha `diario_desde` (nulo = como sempre, um valor por
-- período) e o lançamento ganha `dia` (nulo = o valor do período inteiro, como todos os de antes).
--   · `periodo` continua SEMPRE o início do período (o gatilho põe pelo dia): tudo o que agrupa por período segue igual.
--   · Um valor por DIA (índice único parcial) e um valor de período por período (o índice de antes, só para dia nulo).
--   · No mesmo período, NUNCA as duas coisas: ou o total do período (o de antes), ou os dias.
--   · O valor do período = SOMA dos dias quando o indicador soma; senão, a MÉDIA dos dias.
--   · Dia de amanhã não entra; aba antiga (que manda o período inteiro) num indicador diário é recusada.
-- O OKR (kpis_valores_ligados) passa a juntar os dias de cada período antes de tudo — só a parte do lançado muda.
--
-- ORDEM: o código que conhece o diário (sonda a coluna `diario_desde`) vai ao ar ANTES ou junto. A tela antiga continua
-- funcionando nos indicadores que não são diários.
-- Desfazer: 035_rollback.sql (só se nenhum indicador estiver diário com dias lançados — ele confere).

begin;
set local lock_timeout = '5s';

-- TRAVAS: as funções que esta migração troca têm de ser as lidas em 29/10 (023 para o gatilho; 026 + o remendo da 031
-- para kpis_valores_ligados). Qualquer uma diferente: nada é mudado.
do $t$
declare
  g text := pg_get_functiondef('public.kpis_lancamento_antes()'::regprocedure);
  v text := pg_get_functiondef('public.kpis_valores_ligados(jsonb)'::regprocedure);
begin
  if position('new.periodo := public.kpis_inicio_periodo(v_freq, new.periodo);' in g) = 0
     or position('KPIS_PERIODO_FUTURO' in g) = 0 or position('new.dia' in g) > 0 then
    raise exception 'KPI 035: o gatilho kpis_lancamento_antes não é o lido em 29/10 — nada foi mudado. Chame o Claude.';
  end if;
  if position('select o.p_dono, o.i_id, o.p_de, o.p_ate, l.periodo as per, l.valor as val' in v) = 0
     or position('kpis_setor_so_edson' in v) = 0 then
    raise exception 'KPI 035: kpis_valores_ligados não é a lida em 29/10 — nada foi mudado. Chame o Claude.';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kpis_lancamento' and column_name = 'dia') then
    raise exception 'KPI 035: a coluna kpis_lancamento.dia já existe — a 035 já rodou? Nada foi mudado.';
  end if;
end $t$;

-- 1. As colunas novas.
alter table public.kpis_indicador add column diario_desde date;
alter table public.kpis_indicador add constraint kpis_ind_diario check (diario_desde is null or (diario_desde >= '2000-01-01' and diario_desde <= '2100-12-31'));
comment on column public.kpis_indicador.diario_desde is
  '035: o dia em que o lançamento diário começa (nulo = um valor por período). A cobrança de "falta lançar" conta dele em diante.';
alter table public.kpis_lancamento add column dia date;
alter table public.kpis_lancamento add constraint kpis_lanc_dia check (dia is null or (dia >= '2000-01-01' and dia <= '2100-12-31'));
comment on column public.kpis_lancamento.dia is
  '035: o dia do lançamento diário (nulo = o valor do período inteiro). periodo continua sendo o início do período.';
alter table public.kpis_lancamento_hist add column if not exists dia date;   -- o desfazer o deixa (é registro)
-- A tela se identifica ao CORRIGIR (como no indicador, 026–028): a de antes da 035 não conhece o dia — junta os dias
-- de um período numa linha só e "corrigiria" o mês inteiro em cima de um dia. Não fica gravado (o gatilho zera).
alter table public.kpis_lancamento add column versao_tela int;

-- 2. Um valor por dia; um valor de período por período (o de antes, agora só para dia nulo).
alter table public.kpis_lancamento drop constraint kpis_lanc_unico;
create unique index kpis_lanc_periodo_uk on public.kpis_lancamento (indicador_id, periodo) where dia is null;
create unique index kpis_lanc_dia_uk on public.kpis_lancamento (indicador_id, dia) where dia is not null;
create index if not exists kpis_lanc_ind_per_idx on public.kpis_lancamento (indicador_id, periodo);

-- 3. O que a tela lê e escreve (GRANT de coluna, como em toda a 023).
grant select (diario_desde), insert (diario_desde), update (diario_desde) on public.kpis_indicador to authenticated;
grant select (dia), insert (dia), update (versao_tela) on public.kpis_lancamento to authenticated;
grant select (dia) on public.kpis_lancamento_hist to authenticated;

-- 4. O gatilho do lançamento: o dia, o dia futuro, a mistura e a aba antiga. (Partindo do texto de 29/10 = 023.)
create or replace function public.kpis_lancamento_antes()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_freq text; v_inicio date; v_diario date;
begin
  if tg_op = 'DELETE' then
    insert into public.kpis_lancamento_hist (lancamento_id, indicador_id, periodo, dia, acao, valor_antes, comentario_antes, por)
    values (old.id, old.indicador_id, old.periodo, old.dia, 'apagou', old.valor, old.comentario, auth.uid());
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
    new.id := old.id; new.indicador_id := old.indicador_id; new.periodo := old.periodo; new.dia := old.dia;
    new.lancado_por := old.lancado_por; new.lancado_em := old.lancado_em;
    -- 035: lançamento de DIA só se altera pela tela que conhece o dia (versao_tela 35).
    if old.dia is not null and coalesce(new.versao_tela, 0) < 35 then
      raise exception 'KPIS_TELA_ANTIGA: esta tela é de antes do lançamento diário — recarregue a página (Ctrl+Shift+R) e faça de novo.' using errcode = 'P0001'; end if;
  end if;
  if tg_op = 'INSERT' then
    -- FOR SHARE: ligar/desligar o diário (UPDATE do indicador) espera este lançamento terminar, e vice-versa — senão os
    -- dois podiam passar juntos e deixar total de período e dias no mesmo período. Só no INSERT: no Corrigir ela não
    -- serve para nada e abriria impasse com kpis_excluir_indicador (que trava o indicador e apaga os lançamentos).
    select i.frequencia, i.inicio, i.diario_desde into v_freq, v_inicio, v_diario from public.kpis_indicador i where i.id = new.indicador_id for share;
    if new.dia is not null then
      -- 035: lançamento de UM DIA. O período é o que contém o dia; dia de amanhã não entra (hoje = Joinville).
      if v_diario is null then
        raise exception 'KPIS_NAO_DIARIO: este indicador é lançado por período, não por dia — atualize a página (F5).' using errcode = 'P0001'; end if;
      if new.dia > public.kpis_hoje() then
        raise exception 'KPIS_DIA_FUTURO: este dia ainda não chegou.' using errcode = 'P0001'; end if;
      new.periodo := public.kpis_inicio_periodo(v_freq, new.dia);
      if new.periodo < public.kpis_inicio_periodo(v_freq, v_diario) then
        raise exception 'KPIS_ANTES_DO_DIARIO: o lançamento diário deste indicador começa em %; antes disso o valor é do período inteiro.',
          to_char(v_diario, 'DD/MM/YYYY') using errcode = 'P0001'; end if;
      if new.dia < v_inicio then
        raise exception 'KPIS_ANTES_DO_INICIO: este dia é anterior ao início do indicador.' using errcode = 'P0001'; end if;
      -- dois lançamentos ao mesmo tempo no mesmo período não misturam total e dias
      perform pg_advisory_xact_lock(hashtext('kpis_lanc:' || new.indicador_id::text || ':' || new.periodo::text));
      if exists (select 1 from public.kpis_lancamento l where l.indicador_id = new.indicador_id and l.periodo = new.periodo and l.dia is null) then
        raise exception 'KPIS_PERIODO_COM_TOTAL: este período já tem o valor do período inteiro — apague-o antes de lançar os dias.' using errcode = 'P0001'; end if;
    else
      new.periodo := public.kpis_inicio_periodo(v_freq, new.periodo);
      if new.periodo > public.kpis_inicio_periodo(v_freq, public.kpis_hoje()) then
        raise exception 'KPIS_PERIODO_FUTURO: este período ainda não começou.' using errcode = 'P0001'; end if;   -- hoje = Joinville
      if new.periodo < v_inicio then
        raise exception 'KPIS_ANTES_DO_INICIO: este período é anterior ao início do indicador.' using errcode = 'P0001'; end if;
      -- 035: num indicador diário, o período inteiro só antes do diário começar — senão é a aba antiga mandando o mês
      -- (seria contado junto com os dias).
      if v_diario is not null and new.periodo >= public.kpis_inicio_periodo(v_freq, v_diario) then
        raise exception 'KPIS_LANCAR_POR_DIA: este indicador é lançado todo dia — atualize a página (F5) e escolha o dia.' using errcode = 'P0001'; end if;
      perform pg_advisory_xact_lock(hashtext('kpis_lanc:' || new.indicador_id::text || ':' || new.periodo::text));
      if exists (select 1 from public.kpis_lancamento l where l.indicador_id = new.indicador_id and l.periodo = new.periodo and l.dia is not null) then
        raise exception 'KPIS_LANCAR_POR_DIA: este período já tem dias lançados — lance o dia, não o período inteiro.' using errcode = 'P0001'; end if;
    end if;
    new.lancado_por := auth.uid(); new.lancado_em := clock_timestamp(); new.alterado_por := null; new.alterado_em := null;
  elsif new.valor is distinct from old.valor or new.comentario is distinct from old.comentario then
    if new.valor is distinct from old.valor and length(btrim(coalesce(new.motivo, ''))) < 3 then
      raise exception 'KPIS_MOTIVO: diga por que o valor mudou.' using errcode = 'P0001'; end if;
    if length(new.motivo) > 300 then
      raise exception 'KPIS_MOTIVO_LONGO: o motivo vai até 300 letras.' using errcode = 'P0001'; end if;
    insert into public.kpis_lancamento_hist (lancamento_id, indicador_id, periodo, dia, acao, valor_antes, valor_depois, comentario_antes, motivo, por)
    values (old.id, old.indicador_id, old.periodo, old.dia, 'corrigiu', old.valor, new.valor, old.comentario, nullif(btrim(new.motivo), ''), auth.uid());
    new.alterado_por := auth.uid(); new.alterado_em := clock_timestamp();
  end if;
  new.comentario := nullif(btrim(new.comentario), '');
  new.motivo := null;                      -- o motivo mora só no histórico
  new.versao_tela := null;                 -- 035: a identificação da tela não fica gravada
  new.atualizado_em := clock_timestamp();
  return new;
end $function$;

-- 5. O indicador diário: só o lançado pelo setor; não deixa total de período e dias no mesmo período; não volta atrás
--    com dias lançados. (Gatilho próprio, depois do kpis_indicador_antes da 028 — ordem alfabética — que já alinhou o início.)
create or replace function public.kpis_indicador_diario()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_per date;
begin
  if new.diario_desde is not null then
    if new.tipo <> 'manual' then
      raise exception 'KPIS_DIARIO_CALCULADO: só o indicador lançado pelo setor pode ser lançado todo dia (o calculado já vem da base).' using errcode = 'P0001'; end if;
    if new.diario_desde < new.inicio then new.diario_desde := new.inicio; end if;
  end if;
  if tg_op = 'UPDATE' and new.diario_desde is not distinct from old.diario_desde and new.frequencia is not distinct from old.frequencia
     and new.tipo is not distinct from old.tipo then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.diario_desde is not null then
      v_per := public.kpis_inicio_periodo(new.frequencia, new.diario_desde);
      select min(l.periodo) into v_per from public.kpis_lancamento l
       where l.indicador_id = new.id and l.dia is null and l.periodo >= v_per;
      if v_per is not null then
        raise exception 'KPIS_DIARIO_MISTURA: % já tem o valor do período inteiro — o lançamento todo dia começa no período seguinte (ou apague aquele valor).',
          to_char(v_per, 'DD/MM/YYYY') using errcode = 'P0001'; end if;
      if exists (select 1 from public.kpis_lancamento l where l.indicador_id = new.id and l.dia is not null
                   and l.dia < public.kpis_inicio_periodo(new.frequencia, new.diario_desde)) then
        raise exception 'KPIS_DIARIO_COM_DIAS: há dias lançados antes desta data — o lançamento todo dia não pode começar depois deles.' using errcode = 'P0001'; end if;
    elsif exists (select 1 from public.kpis_lancamento l where l.indicador_id = new.id and l.dia is not null) then
      raise exception 'KPIS_DIARIO_COM_DIAS: este indicador já tem dias lançados — não dá para voltar a lançar por período.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $function$;
create trigger kpis_indicador_diario before insert or update on public.kpis_indicador
  for each row execute function public.kpis_indicador_diario();

-- 6. O OKR: o lançado junta os dias de cada período (soma, ou média se o indicador não soma) ANTES da janela — o resto
--    da função é o de 29/10 (026 + o remendo da 031), trocado por TEXTO, como a 031 fez.
do $v$
declare
  d text := pg_get_functiondef('public.kpis_valores_ligados(jsonb)'::regprocedure);
  velho text := E'    select o.p_dono, o.i_id, o.p_de, o.p_ate, l.periodo as per, l.valor as val\r\n      from ok o join public.kpis_lancamento l on l.indicador_id = o.i_id\r\n     where o.i_tipo = ''manual''\r\n';
  novo text := E'    select o.p_dono, o.i_id, o.p_de, o.p_ate, l.periodo as per,\r\n           case when o.i_con <> ''soma'' and bool_or(l.dia is not null) then avg(l.valor) else sum(l.valor) end as val   -- 035: os dias do período\r\n      from ok o join public.kpis_lancamento l on l.indicador_id = o.i_id\r\n     where o.i_tipo = ''manual''\r\n     group by o.p_dono, o.i_id, o.p_de, o.p_ate, l.periodo, o.i_con\r\n';
begin
  if position(velho in d) = 0 then
    -- o texto pode ter vindo com \n em vez de \r\n
    velho := replace(velho, E'\r\n', E'\n'); novo := replace(novo, E'\r\n', E'\n');
  end if;
  if position(velho in d) = 0 or (length(d) - length(replace(d, velho, ''))) / length(velho) <> 1 then
    raise exception 'KPI 035: não achei a parte do lançado em kpis_valores_ligados uma vez só — nada foi mudado. Chame o Claude.';
  end if;
  execute replace(d, velho, novo);
end $v$;

commit;

-- CONFERÊNCIA (só lê). Esperado: true · true · true · true · true · true
select exists (select 1 from information_schema.columns where table_name = 'kpis_indicador' and column_name = 'diario_desde') as col_indicador,
       exists (select 1 from information_schema.columns where table_name = 'kpis_lancamento' and column_name = 'dia') as col_lancamento,
       (select count(*) = 2 from pg_indexes where indexname in ('kpis_lanc_periodo_uk', 'kpis_lanc_dia_uk')) as indices,
       position('KPIS_LANCAR_POR_DIA' in pg_get_functiondef('public.kpis_lancamento_antes()'::regprocedure)) > 0 as gatilho,
       exists (select 1 from pg_trigger where tgname = 'kpis_indicador_diario') as gatilho_indicador,
       position('035: os dias do período' in pg_get_functiondef('public.kpis_valores_ligados(jsonb)'::regprocedure)) > 0 as okr;
