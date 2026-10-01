-- 023_rollback — desfaz o KPI DOS SETORES (023_kpi_dos_setores.sql).
--
-- ⚠ APAGA os dados do KPI dos setores (indicadores, metas, lançamentos e o histórico). Exporte antes.
-- Apaga por LISTA EXPLÍCITA — nunca por padrão 'kpi%': kpi_desligar_usuario (022) e kpi_rename_login
-- têm de continuar de pé (a trava do fim confere).
-- Os KRs que tinham kpiId ficam com ele: aparecem "sem valor do KPI" até alguém desligar. Não faz mal.
-- =====================================================================================================
begin;

drop function if exists public.kpis_pode_lancar(public.kpis_indicador);   -- depende do tipo da tabela: sai primeiro
drop table if exists public.kpis_lancamento_hist, public.kpis_lancamento, public.kpis_meta, public.kpis_indicador;   -- políticas e gatilhos vão junto
drop function if exists
  public.kpis_valores_ligados(jsonb), public.kpis_meu_acesso(), public.kpis_setores(), public.kpis_tipos_atividade(),
  public.kpis_serie_calculada(uuid, date, date), public.kpis_calc_interno(uuid, date, date), public.kpis_dono_ve(text, text),
  public.kpis_vejo_indicador(uuid), public.kpis_posso_lancar(uuid), public.kpis_meu_setor(), public.kpis_ve_todos(),
  public.kpis_administra(), public.kpis_visualizador(), public.kpis_cadastrado(), public.kpis_data_ou_nulo(text),
  public.kpis_proximo_periodo(text, date), public.kpis_fim_periodo(text, date), public.kpis_inicio_periodo(text, date),
  public.kpis_setor_chave(text), public.kpis_hoje(),
  public.kpis_indicador_antes(), public.kpis_indicador_antes_apagar(), public.kpis_indicador_depois(), public.kpis_meta_antes(),
  public.kpis_lancamento_antes();

do $$ begin
  if to_regprocedure('public.kpi_desligar_usuario(uuid, date)') is null
     or not exists (select 1 from pg_proc where proname = 'kpi_rename_login') then
    raise exception '023_rollback: kpi_desligar_usuario ou kpi_rename_login sumiu. Nada foi desfeito.';
  end if;
  if exists (select 1 from pg_proc where proname like 'kpis\_%') or exists (select 1 from pg_class where relname like 'kpis\_%') then
    raise exception '023_rollback: sobrou objeto kpis_. Nada foi desfeito — mande o print ao Claude.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- Conferência: 0 · 0 · true · true
select (select count(*) from pg_proc where proname like 'kpis\_%')  as funcoes_kpis,
       (select count(*) from pg_class where relname like 'kpis\_%') as tabelas_kpis,
       to_regprocedure('public.kpi_desligar_usuario(uuid, date)') is not null as intacta_022,
       exists (select 1 from pg_proc where proname = 'kpi_rename_login')     as intacta_renomear;
