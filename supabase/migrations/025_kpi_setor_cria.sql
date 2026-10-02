-- 025 — KPI DOS SETORES: CADA SETOR CRIA OS SEUS INDICADORES (01/10/2026).
--
-- Pedido do Edson, 01/10: "Importante é que cada setor possa criar os seus próprios indicadores a mais. No caso
-- do da fábrica, ele pode criar algum índice, alguma coisa que ele ache que seja importante. E assim como os
-- outros setores também possam criar por si só, sem depender de mim."
--
-- Antes (023): só o Edson e os admins de OKR criavam indicador, punham meta, editavam e arquivavam; o setor só
-- lançava. Um setor sem indicador nem via a aba.
-- Agora:
--   · quem tem setor (cadastrado, não visualizador, não desligado) CRIA indicador do PRÓPRIO setor;
--   · o que o setor criou (do_setor = true, gravado pelo gatilho, imutável) o setor também GERENCIA: meta,
--     edição, arquivar, excluir (excluir só sem lançamento, como antes);
--   · o que o Edson ou um admin de OKR criou continua deles (o setor só lança) — ex.: os 6 da Fábrica de 01/10;
--   · indicador CALCULADO criado pelo setor conta só as pessoas do setor (escopo 'setor'): nenhum setor soma
--     as horas dos outros;
--   · a lista de tipos de atividade (para o calculado) abre para quem cria;
--   · kpis_meu_acesso ganha "cria" (a aba aparece mesmo sem indicador, para criar o primeiro).
-- Não muda: quem VÊ (setor vê o seu; Edson, CEO e admins de OKR veem todos), quem LANÇA, o histórico, o CEO
-- (visão macro: cria só se tiver setor, e não mexe em pessoas — isso é do servidor).
--
-- Rodar inteiro no SQL Editor. Precisa da 023. Tudo numa transação: se algo falhar, nada fica.

begin;
set local search_path = public, extensions;

do $$ begin
  if to_regclass('public.kpis_indicador') is null or to_regprocedure('public.kpis_administra()') is null then
    raise exception 'KPIS 025: rode a 023 antes. Nada foi criado.';
  end if;
end $$;

-- 1) quem criou pelo setor (não é o Edson nem admin de OKR): o setor gerencia o indicador
alter table public.kpis_indicador add column if not exists do_setor boolean not null default false;

-- 2) as perguntas
create or replace function public.kpis_posso_criar(p_setor text) returns boolean language sql stable security definer set search_path = public as $f$
  select coalesce(public.kpis_administra(), false)
      or (public.kpis_meu_setor() is not null and public.kpis_setor_chave(p_setor) = public.kpis_meu_setor())
$f$;
create or replace function public.kpis_gerencio_indicador(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i
                  where i.id = p_indicador
                    and (public.kpis_administra()
                         or (i.do_setor and public.kpis_meu_setor() is not null
                             and public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())))
$f$;
create or replace function public.kpis_pode_gerir(i public.kpis_indicador) returns boolean language sql stable set search_path = public as $f$
  select public.kpis_gerencio_indicador(i.id)
$f$;   -- coluna calculada para o PostgREST (como kpis_pode_lancar)

-- 3) o gatilho do indicador: marca do_setor na criação (e não deixa mudar), e o calculado do setor só conta o setor
create or replace function public.kpis_indicador_antes() returns trigger language plpgsql security definer set search_path = public as $f$
begin
  if tg_op = 'INSERT' then
    new.criado_por := auth.uid(); new.criado_em := clock_timestamp();
    new.do_setor := not coalesce(public.kpis_administra(), false);
  else
    new.id := old.id; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
    new.do_setor := old.do_setor;
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

-- 4) a meta: quem gerencia o indicador (antes: só o Edson e os admins de OKR)
create or replace function public.kpis_meta_antes() returns trigger language plpgsql security definer set search_path = public as $f$
declare v_freq text; v_sentido text; v_inicio date;
begin
  if tg_op = 'UPDATE' and coalesce(current_setting('kpis.realinhando', true), '') = 'sim' then
    new.indicador_id := old.indicador_id; new.meta := old.meta; new.limite_alerta := old.limite_alerta;
    new.por := old.por; new.em := old.em;
    return new;
  end if;
  if not public.kpis_gerencio_indicador(new.indicador_id) then   -- no UPDATE a tela não muda indicador_id (sem GRANT)
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

-- 5) os tipos de atividade (para o calculado): quem cria
create or replace function public.kpis_tipos_atividade()
returns table (id uuid, nome text, ativo boolean)
language sql stable security definer set search_path = public as $f$
  select t.id, t.name, coalesce(t.is_active, true) from public.activity_types t
   where public.kpis_administra() or public.kpis_meu_setor() is not null order by t.name
$f$;

-- 6) o acesso ganha "cria" (muda o tipo de retorno: recria)
drop function if exists public.kpis_meu_acesso();
create function public.kpis_meu_acesso()
returns table (cadastrado boolean, visualizador boolean, ve_todos boolean, administra boolean,
               setor_chave text, setor_nome text, indicadores integer, posso_lancar integer, cria boolean)
language sql stable security definer set search_path = public as $f$
  select public.kpis_cadastrado(), public.kpis_visualizador(), public.kpis_ve_todos(), public.kpis_administra(),
         public.kpis_meu_setor(),
         (select nullif(btrim(u.sector), '') from public.users u where u.id = auth.uid()
             and public.kpis_cadastrado() and not public.kpis_visualizador()),
         (select count(*)::int from public.kpis_indicador i where i.ativo
             and (public.kpis_ve_todos() or public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())),
         (select count(*)::int from public.kpis_indicador i where i.ativo and i.tipo = 'manual'
             and (public.kpis_administra() or public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())),
         coalesce(public.kpis_administra(), false) or public.kpis_meu_setor() is not null
$f$;

-- 7) as políticas: criar no próprio setor; editar/apagar o que o setor criou; meta de quem gerencia
drop policy if exists kpis_indicador_criar  on public.kpis_indicador;
drop policy if exists kpis_indicador_editar on public.kpis_indicador;
drop policy if exists kpis_indicador_apagar on public.kpis_indicador;
create policy kpis_indicador_criar  on public.kpis_indicador for insert to authenticated
  with check (public.kpis_posso_criar(setor));
create policy kpis_indicador_editar on public.kpis_indicador for update to authenticated
  using ((select public.kpis_administra())
         or (do_setor and public.kpis_setor_chave(setor) = (select public.kpis_meu_setor())))
  with check ((select public.kpis_administra())
         or (do_setor and public.kpis_setor_chave(setor) = (select public.kpis_meu_setor())));
create policy kpis_indicador_apagar on public.kpis_indicador for delete to authenticated
  using ((select public.kpis_administra())
         or (do_setor and public.kpis_setor_chave(setor) = (select public.kpis_meu_setor())));
drop policy if exists kpis_meta_criar  on public.kpis_meta;
drop policy if exists kpis_meta_editar on public.kpis_meta;
drop policy if exists kpis_meta_apagar on public.kpis_meta;
create policy kpis_meta_criar  on public.kpis_meta for insert to authenticated with check (public.kpis_gerencio_indicador(indicador_id));
create policy kpis_meta_editar on public.kpis_meta for update to authenticated
  using (public.kpis_gerencio_indicador(indicador_id)) with check (public.kpis_gerencio_indicador(indicador_id));
create policy kpis_meta_apagar on public.kpis_meta for delete to authenticated using (public.kpis_gerencio_indicador(indicador_id));

-- 8) EXECUTE
revoke all on function public.kpis_posso_criar(text), public.kpis_gerencio_indicador(uuid), public.kpis_pode_gerir(public.kpis_indicador),
  public.kpis_meu_acesso() from public, anon;
grant execute on function public.kpis_posso_criar(text), public.kpis_gerencio_indicador(uuid), public.kpis_pode_gerir(public.kpis_indicador),
  public.kpis_meu_acesso() to authenticated, service_role;
revoke all on function public.kpis_indicador_antes(), public.kpis_meta_antes() from public, anon, authenticated;

-- 9) travas (as mesmas da 023): nada que devolva users ao navegador; nada INVOKER citando okr_state; anon nada
do $$ begin
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%'
              and pg_get_function_result(p.oid) ilike '%users%'
              and (has_function_privilege('authenticated', p.oid, 'EXECUTE') or has_function_privilege('anon', p.oid, 'EXECUTE'))) then
    raise exception 'KPIS 025: função kpis_ devolveria users ao navegador. Nada foi criado.';
  end if;
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and not p.prosecdef
              and pg_get_functiondef(p.oid) ilike '%okr_state%'
              and has_function_privilege('authenticated', p.oid, 'EXECUTE')) then
    raise exception 'KPIS 025: função kpis_ cita okr_state sem SECURITY DEFINER. Nada foi criado.';
  end if;
  if exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and has_function_privilege('anon', p.oid, 'EXECUTE'))
     or has_column_privilege('authenticated', 'public.kpis_indicador', 'do_setor', 'INSERT')
     or has_column_privilege('authenticated', 'public.kpis_indicador', 'do_setor', 'UPDATE') then
    raise exception 'KPIS 025: privilégio fora do esperado. Nada foi criado.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: true · 0 · 13 · true · true · false · false · 0
select
  exists (select 1 from information_schema.columns where table_name = 'kpis_indicador' and column_name = 'do_setor')     as tem_do_setor,
  (select count(*) from public.kpis_indicador where do_setor)                                                          as criados_pelo_setor,
  (select count(*) from pg_policies where tablename like 'kpis\_%')                                                    as politicas,
  pg_get_function_result('public.kpis_meu_acesso()'::regprocedure) ilike '%cria boolean%'                              as acesso_tem_cria,
  to_regprocedure('public.kpis_pode_gerir(public.kpis_indicador)') is not null                                         as tem_pode_gerir,
  has_column_privilege('authenticated', 'public.kpis_indicador', 'do_setor', 'UPDATE')                                 as tela_muda_do_setor,
  has_function_privilege('anon', 'public.kpis_meu_acesso()', 'EXECUTE')                                                as anonimo_le_acesso,
  (select count(*) from pg_proc where proname like 'kpis\_%' and has_function_privilege('anon', oid, 'EXECUTE'))       as anonimo_executa;
