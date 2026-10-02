-- 025_rollback — volta o KPI dos setores ao estado da 023 (01/10/2026): só o Edson e os admins de OKR criam,
-- põem meta, editam e arquivam; o setor só lança. Os indicadores que o setor criou FICAM (passam a ser geridos
-- pelo Edson e pelos admins de OKR); nada é apagado. Se a 026 estiver instalada, rode o 026_rollback antes.
-- Rodar inteiro no SQL Editor. Tudo numa transação.

begin;
set local search_path = public, extensions;

do $$ begin
  if to_regprocedure('public.kpis_vejo_setor(text)') is not null then
    raise exception 'KPIS 025_rollback: a 026 está instalada — rode o 026_rollback antes. Nada foi mudado.';
  end if;
  if to_regprocedure('public.kpis_gerencio_indicador(uuid)') is null then
    raise exception 'KPIS 025_rollback: a 025 não está instalada. Nada foi mudado.';
  end if;
end $$;

-- 1) as políticas voltam às da 023
drop policy if exists kpis_indicador_criar  on public.kpis_indicador;
drop policy if exists kpis_indicador_editar on public.kpis_indicador;
drop policy if exists kpis_indicador_apagar on public.kpis_indicador;
drop policy if exists kpis_meta_criar  on public.kpis_meta;
drop policy if exists kpis_meta_editar on public.kpis_meta;
drop policy if exists kpis_meta_apagar on public.kpis_meta;
create policy kpis_indicador_criar  on public.kpis_indicador for insert to authenticated with check ((select public.kpis_administra()));
create policy kpis_indicador_editar on public.kpis_indicador for update to authenticated using ((select public.kpis_administra())) with check ((select public.kpis_administra()));
create policy kpis_indicador_apagar on public.kpis_indicador for delete to authenticated using ((select public.kpis_administra()));
create policy kpis_meta_criar  on public.kpis_meta for insert to authenticated with check ((select public.kpis_administra()));
create policy kpis_meta_editar on public.kpis_meta for update to authenticated using ((select public.kpis_administra())) with check ((select public.kpis_administra()));
create policy kpis_meta_apagar on public.kpis_meta for delete to authenticated using ((select public.kpis_administra()));

-- 2) as funções voltam ao texto da 023
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
create or replace function public.kpis_tipos_atividade()
returns table (id uuid, nome text, ativo boolean)
language sql stable security definer set search_path = public as $f$
  select t.id, t.name, coalesce(t.is_active, true) from public.activity_types t
   where public.kpis_administra() order by t.name
$f$;
drop function if exists public.kpis_meu_acesso();
create function public.kpis_meu_acesso()
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
$f$;
revoke all on function public.kpis_meu_acesso() from public, anon;
grant execute on function public.kpis_meu_acesso() to authenticated, service_role;
revoke all on function public.kpis_indicador_antes(), public.kpis_meta_antes() from public, anon, authenticated;

-- 3) as funções da 025 e a marca do_setor saem
drop function if exists public.kpis_pode_gerir(public.kpis_indicador);
drop function if exists public.kpis_gerencio_indicador(uuid);
drop function if exists public.kpis_posso_criar(text);
alter table public.kpis_indicador drop column if exists do_setor;

do $$ begin
  if to_regprocedure('public.kpis_gerencio_indicador(uuid)') is not null
     or exists (select 1 from information_schema.columns where table_name = 'kpis_indicador' and column_name = 'do_setor')
     or (select count(*) from pg_policies where tablename like 'kpis\_%') <> 13
     or exists (select 1 from pg_proc p where p.proname like 'kpis\_%' and has_function_privilege('anon', p.oid, 'EXECUTE')) then
    raise exception 'KPIS 025_rollback: o desfazer não fechou. Nada foi mudado.';
  end if;
end $$;

commit;
notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: false · false · 13 · 0
select to_regprocedure('public.kpis_gerencio_indicador(uuid)') is not null                                    as tem_025,
       exists (select 1 from information_schema.columns where table_name = 'kpis_indicador' and column_name = 'do_setor') as tem_do_setor,
       (select count(*) from pg_policies where tablename like 'kpis\_%')                                     as politicas,
       (select count(*) from pg_proc where proname like 'kpis\_%' and has_function_privilege('anon', oid, 'EXECUTE')) as anonimo_executa;
