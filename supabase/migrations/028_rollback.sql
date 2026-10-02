-- 028_rollback — volta o KPI dos setores ao estado da 027 (02/10/2026): o setor volta a cuidar só do que ele criou,
-- apagar lançamento volta a ser do Edson / admin de OKR, e sai o kpis_excluir_indicador.
-- RECUSA se o setor tiver criado calculado fora do escopo "do setor" (a regra da 027 não aceitaria mais editá-lo):
-- passe-o para "das pessoas do setor" (ou apague) antes. Nada é apagado aqui.
-- Rodar inteiro no SQL Editor. Tudo numa transação.

begin;
set local search_path = public, extensions;

do $$ begin
  if to_regprocedure('public.kpis_excluir_indicador(uuid, integer)') is null then
    raise exception 'KPIS 028_rollback: a 028 não está instalada. Nada foi mudado.';
  end if;
  if exists (select 1 from public.kpis_indicador where do_setor and tipo = 'calculado' and calc_escopo <> 'setor') then
    raise exception 'KPIS 028_rollback: há calculado criado pelo setor fora do escopo "do setor". Passe-o para "das pessoas do setor" antes. Nada foi mudado.';
  end if;
end $$;

-- 1) quem gerencia, o gatilho e a política voltam ao texto da 026/027
create or replace function public.kpis_gerencio(p_setor text, p_do_setor boolean) returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce(public.kpis_administra() and public.kpis_vejo_setor(p_setor), false)
      or (coalesce(p_do_setor, false) and public.kpis_meu_setor() is not null
          and public.kpis_setor_chave(p_setor) = public.kpis_meu_setor())
$f$;
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
revoke all on function public.kpis_indicador_antes() from public, anon, authenticated;
drop policy if exists kpis_lancamento_apagar on public.kpis_lancamento;
create policy kpis_lancamento_apagar on public.kpis_lancamento for delete to authenticated
  using ((select public.kpis_administra()) and public.kpis_vejo_indicador(indicador_id));

-- 2) sai o excluir
drop function if exists public.kpis_excluir_indicador(uuid, integer);

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: false · 13
select to_regprocedure('public.kpis_excluir_indicador(uuid, integer)') is not null as ainda_tem_028,
       (select count(*) from pg_policies where tablename like 'kpis\_%') as politicas;
