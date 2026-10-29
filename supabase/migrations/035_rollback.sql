-- DESFAZ a 035 (lançamento diário). Só roda se NENHUM lançamento de dia existir (senão os dias virariam valores de
-- período soltos, vários no mesmo período): apague-os antes, ou chame o Claude para juntar cada período num valor só.
-- Volta: o gatilho kpis_lancamento_antes da 023, kpis_valores_ligados sem o agrupamento, o índice único de antes,
-- e tira as colunas (menos o dia do histórico), as permissões e o gatilho kpis_indicador_diario.
begin;
set local lock_timeout = '5s';
do $t$
begin
  if exists (select 1 from public.kpis_lancamento where dia is not null) then
    raise exception 'KPI 035 (desfazer): há % lançamento(s) de dia — nada foi mudado. Chame o Claude.', (select count(*) from public.kpis_lancamento where dia is not null);
  end if;
end $t$;

drop trigger if exists kpis_indicador_diario on public.kpis_indicador;
drop function if exists public.kpis_indicador_diario();

-- kpis_valores_ligados: tira o agrupamento (troca de texto ao contrário)
do $v$
declare
  d text := pg_get_functiondef('public.kpis_valores_ligados(jsonb)'::regprocedure);
  novo text := E'    select o.p_dono, o.i_id, o.p_de, o.p_ate, l.periodo as per,\r\n           case when o.i_con <> ''soma'' and bool_or(l.dia is not null) then avg(l.valor) else sum(l.valor) end as val   -- 035: os dias do período\r\n      from ok o join public.kpis_lancamento l on l.indicador_id = o.i_id\r\n     where o.i_tipo = ''manual''\r\n     group by o.p_dono, o.i_id, o.p_de, o.p_ate, l.periodo, o.i_con\r\n';
  velho text := E'    select o.p_dono, o.i_id, o.p_de, o.p_ate, l.periodo as per, l.valor as val\r\n      from ok o join public.kpis_lancamento l on l.indicador_id = o.i_id\r\n     where o.i_tipo = ''manual''\r\n';
begin
  if position(novo in d) = 0 then novo := replace(novo, E'\r\n', E'\n'); velho := replace(velho, E'\r\n', E'\n'); end if;
  if position(novo in d) = 0 then raise exception 'KPI 035 (desfazer): não achei o agrupamento da 035 em kpis_valores_ligados — nada foi mudado.'; end if;
  execute replace(d, novo, velho);
end $v$;

-- o gatilho do lançamento: o da 023
create or replace function public.kpis_lancamento_antes()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_freq text; v_inicio date;
begin
  if tg_op = 'DELETE' then
    insert into public.kpis_lancamento_hist (lancamento_id, indicador_id, periodo, acao, valor_antes, comentario_antes, por)
    values (old.id, old.indicador_id, old.periodo, 'apagou', old.valor, old.comentario, auth.uid());
    return old;
  end if;
  if tg_op = 'INSERT' then
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
      raise exception 'KPIS_PERIODO_FUTURO: este período ainda não começou.' using errcode = 'P0001'; end if;
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
  new.motivo := null;
  new.atualizado_em := clock_timestamp();
  return new;
end $function$;

-- kpis_lancamento_hist.dia FICA (só sem a leitura pela tela): é o registro de que um dia foi corrigido ou apagado.
revoke select (dia) on public.kpis_lancamento_hist from authenticated;
revoke select (dia), insert (dia), update (versao_tela) on public.kpis_lancamento from authenticated;
revoke select (diario_desde), insert (diario_desde), update (diario_desde) on public.kpis_indicador from authenticated;
drop index if exists public.kpis_lanc_dia_uk;
drop index if exists public.kpis_lanc_periodo_uk;
drop index if exists public.kpis_lanc_ind_per_idx;
alter table public.kpis_lancamento add constraint kpis_lanc_unico unique (indicador_id, periodo);
alter table public.kpis_lancamento drop constraint if exists kpis_lanc_dia;
alter table public.kpis_lancamento drop column dia;
alter table public.kpis_lancamento drop column versao_tela;
alter table public.kpis_indicador drop constraint if exists kpis_ind_diario;
alter table public.kpis_indicador drop column diario_desde;
commit;
