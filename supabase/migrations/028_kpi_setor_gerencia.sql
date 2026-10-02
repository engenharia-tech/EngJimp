-- 028 — KPI DOS SETORES: O SETOR CUIDA DE TODOS OS SEUS INDICADORES (02/10/2026).
--
-- Pedido do Edson, 02/10: "Preciso que os usuários tenham permissão de cadastro e alteração dos seus indicadores.
-- Que não fique na minha mão. Mas que fique na mão de cada usuário. Excluir, cadastrar ou fazer qualquer coisa.
-- Inclusive a forma de medição que vai gerar gráfico."
-- Antes (025): quem é do setor criava e cuidava só do que o PRÓPRIO setor criou; o que o Edson / admin de OKR
-- criou o setor só lançava; apagar lançamento era só do Edson / admin; indicador com lançamento não se excluía.
-- Agora:
--   · quem é do setor GERENCIA todos os indicadores do setor — editar tudo (inclusive a forma de medir: manual ou
--     calculado, de onde, o que conta, de quem, frequência), meta, arquivar, excluir — não importa quem criou;
--   · o setor também APAGA lançamento (o histórico guarda o que foi apagado, por quem e quando) — e assim pode
--     liberar a mudança de frequência/tipo, que continua exigindo o indicador sem lançamentos (períodos baralhados);
--   · kpis_excluir_indicador(): exclui o indicador COM os lançamentos, se a pessoa confirmou o número certo de
--     lançamentos; fica um registro na auditoria (quem, qual, quantos — inclusive os já apagados antes; do P&D,
--     reservado, sem o nome). KR de OKR ligado continua travando;
--   · a tela se identifica com versao_tela 28: a de antes (que forçava "do setor" para quem não administra) não altera
--     o indicador que o Edson / admin criou — pede para recarregar;
--   · uma trava só sobra: calcular horas, projetos ou paradas "de todo mundo" (inclui o P&D, reservado) é do Edson
--     e dos admins de OKR; o setor calcula com as pessoas do setor ou com a régua da engenharia.
-- Nada mais muda: quem vê (o P&D reservado), quem lança, o motor, a ligação com o OKR.
--
-- Rodar inteiro no SQL Editor, DEPOIS da 027. Tudo numa transação: se algo falhar, nada fica.

begin;
set local search_path = public, extensions;

do $$ begin
  if to_regprocedure('public.kpis_fontes_calculo()') is null then
    raise exception 'KPIS 028: rode a 027 antes. Nada foi criado.';
  end if;
end $$;

-- 1) quem gerencia: o setor inteiro ------------------------------------------------------------------------------------
create or replace function public.kpis_gerencio(p_setor text, p_do_setor boolean) returns boolean language sql stable security definer set search_path = public as $f$
  -- 028: quem é do setor gerencia TODOS os indicadores do setor (quem criou não importa mais; p_do_setor fica na
  -- assinatura para as políticas não mudarem); o Edson / admin de OKR, onde VÊ (o P&D reservado continua valendo).
  select coalesce(public.kpis_administra() and public.kpis_vejo_setor(p_setor), false)
      or (public.kpis_meu_setor() is not null and public.kpis_setor_chave(p_setor) = public.kpis_meu_setor())
$f$;

-- 2) o gatilho do indicador (o da 027, com a trava do "de todo mundo" no lugar da do setor) --------------------------
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
    -- 028: a tela de antes da 028 força "do setor" no cálculo — de quem não administra, e de qualquer um num indicador
    -- criado pelo setor. Agora que o setor usa a régua da engenharia, ela trocaria a régua calada. Só a tela nova
    -- (versao_tela 28) altera o indicador do Edson / admin sendo do setor, ou tira um calculado do escopo que ele tem.
    if coalesce(new.versao_tela, 0) < 28
       and ((not old.do_setor and not coalesce(public.kpis_administra(), false))
            or (old.tipo = 'calculado' and coalesce(old.calc_escopo, 'setor') <> 'setor'
                and new.calc_escopo is distinct from old.calc_escopo)) then
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
  -- 028: o setor gerencia todos os seus indicadores e escolhe como medir. Só o "de todo mundo" em horas, projetos e
  -- paradas (que inclui o P&D, reservado) fica com o Edson / admin de OKR: quem não administra não cria nem muda o
  -- cálculo para isso — mas edita o resto de um indicador que já era assim (nome, meta, unidade…).
  if new.tipo = 'calculado' and new.calc_escopo = 'todos' and new.calc_fonte in ('atividades', 'projetos', 'paradas')
     and not coalesce(public.kpis_administra(), false)
     and (tg_op = 'INSERT'
          or new.tipo is distinct from old.tipo or new.calc_fonte is distinct from old.calc_fonte
          or new.calc_medida is distinct from old.calc_medida or new.calc_escopo is distinct from old.calc_escopo
          -- tipos e filtro como CONJUNTO (a tela pode mandar a mesma lista em outra ordem)
          or not (coalesce(new.calc_tipos, '{}') @> coalesce(old.calc_tipos, '{}') and coalesce(new.calc_tipos, '{}') <@ coalesce(old.calc_tipos, '{}'))
          or not (coalesce(new.calc_filtro, '{}') @> coalesce(old.calc_filtro, '{}') and coalesce(new.calc_filtro, '{}') <@ coalesce(old.calc_filtro, '{}'))) then
    raise exception 'KPIS_ESCOPO_SETOR: contar horas, projetos ou paradas de todo mundo é só do Edson e dos admins de OKR (inclui o P&D, que é reservado) — use as pessoas do setor ou a régua da engenharia.' using errcode = 'P0001';
  end if;
  new.inicio := public.kpis_inicio_periodo(new.frequencia, coalesce(new.inicio, public.kpis_hoje()));
  if tg_op = 'UPDATE' and exists (select 1 from public.kpis_lancamento l where l.indicador_id = old.id and l.periodo < new.inicio) then
    raise exception 'KPIS_INICIO_DEPOIS_DE_LANCAMENTO: há lançamento antes do novo início.' using errcode = 'P0001';
  end if;
  new.atualizado_por := auth.uid(); new.atualizado_em := clock_timestamp();
  return new;
end $f$;

-- 3) apagar lançamento: quem gerencia o indicador (o Edson / admin onde vê, ou o setor) -------------------------------
drop policy if exists kpis_lancamento_apagar on public.kpis_lancamento;
create policy kpis_lancamento_apagar on public.kpis_lancamento for delete to authenticated
  using (public.kpis_gerencio_indicador(indicador_id));

-- 4) excluir o indicador com os lançamentos (confirmados) e o registro na auditoria -----------------------------------
create or replace function public.kpis_excluir_indicador(p_indicador uuid, p_lancamentos integer) returns integer
language plpgsql security definer set search_path = public as $f$
declare v_ind public.kpis_indicador; n int; a int; h int; v_res boolean; v_linhas int;
begin
  -- trava a linha do indicador: dois "excluir" juntos, ou um lançamento novo no meio, esperam um pelo outro
  select * into v_ind from public.kpis_indicador where id = p_indicador for update;
  if not found then
    raise exception 'KPIS_JA_EXCLUIDO: este indicador já tinha sido excluído.' using errcode = 'P0001';
  end if;
  if not public.kpis_gerencio_indicador(p_indicador) then
    raise exception 'KPIS_SEM_ACESSO: este indicador não é do seu setor.' using errcode = '42501';
  end if;
  -- a tela diz quantos lançamentos a pessoa confirmou apagar: se mudou no meio, nada some
  select count(*) into n from public.kpis_lancamento where indicador_id = p_indicador;
  if n <> coalesce(p_lancamentos, -1) then
    raise exception 'KPIS_EXCLUIR_CONFIRMA: o indicador tem % lançamento(s) agora (a tela mostrava %) — atualize e confirme de novo.', n, coalesce(p_lancamentos, 0) using errcode = 'P0001';
  end if;
  select count(*) filter (where acao = 'apagou'), count(*) filter (where acao = 'corrigiu') into a, h
    from public.kpis_lancamento_hist where indicador_id = p_indicador;
  v_res := public.kpis_setor_reservado(v_ind.setor);
  delete from public.kpis_lancamento where indicador_id = p_indicador;        -- o gatilho anota cada um no histórico…
  delete from public.kpis_lancamento_hist where indicador_id = p_indicador;   -- …que sai junto com o indicador
  delete from public.kpis_indicador where id = p_indicador;                   -- KR de OKR ligado: o gatilho recusa e NADA some
  get diagnostics v_linhas = row_count;
  if v_linhas <> 1 then
    raise exception 'KPIS_JA_EXCLUIDO: este indicador já tinha sido excluído.' using errcode = 'P0001';
  end if;
  -- a auditoria é lida por quem não vê o P&D: do setor reservado, sem o nome
  insert into public.audit_logs (user_id, user_name, action, entity_type, entity_id, entity_name, details)
  values (auth.uid(),
          (select btrim(coalesce(u.name, '') || ' ' || coalesce(u.surname, '')) from public.users u where u.id = auth.uid()),
          'DELETE', 'KPI_INDICADOR', p_indicador::text,
          case when v_res then 'indicador reservado (' || v_ind.setor || ')' else v_ind.nome end,
          format('%s excluído pela tela do KPI dos setores, com %s lançamento(s); no histórico, %s apagado(s) antes e %s correção(ões).',
                 case when v_res then 'Indicador reservado (' || v_ind.setor || ')' else format('Indicador "%s" (%s)', v_ind.nome, v_ind.setor) end,
                 n, a, h));
  return n;
end $f$;

-- 5) EXECUTE ---------------------------------------------------------------------------------------------------------
revoke all on function public.kpis_excluir_indicador(uuid, integer) from public, anon;
grant execute on function public.kpis_excluir_indicador(uuid, integer) to authenticated, service_role;
revoke all on function public.kpis_indicador_antes() from public, anon, authenticated;

-- 6) TRAVAS — se falhar, NADA fica gravado -----------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and has_function_privilege('anon', p.oid, 'EXECUTE'))
     or not has_function_privilege('authenticated', 'public.kpis_excluir_indicador(uuid, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpis_calc_interno(uuid, date, date)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.kpis_indicador_antes()', 'EXECUTE') then
    raise exception 'KPIS 028: privilégio fora do esperado. Nada foi criado.';
  end if;
  if pg_get_functiondef('public.kpis_calc_interno(uuid, date, date)'::regprocedure) ~* '(salary|_cost|custo|saving|hourly|taxa)' then
    raise exception 'KPIS 028: o cálculo citaria custo/salário. Nada foi criado.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: true · true · 13 · 0 · 79
select
  to_regprocedure('public.kpis_excluir_indicador(uuid, integer)') is not null                                   as tem_excluir,
  has_function_privilege('authenticated', 'public.kpis_excluir_indicador(uuid, integer)', 'EXECUTE')          as tela_exclui,
  (select count(*) from pg_policies where tablename like 'kpis\_%')                                             as politicas,
  (select count(*) from pg_proc where proname like 'kpis\_%' and has_function_privilege('anon', oid, 'EXECUTE')) as anonimo_executa,
  (select count(*) from public.kpis_indicador)                                                                  as indicadores;
