-- =====================================================================================================
-- 030 — CARGOS NOVOS: DIRETOR INDUSTRIAL (a visão do CEO) e REPRESENTANTE (vendedor, "Somente OKR", setor só dele)
--       (06/10/2026)
--
-- Pedido do Edson (06/10): "Preciso que seja criada uma classe chamada de representantes. Eles são os vendedores que
-- trabalham na nossa empresa. E eles precisam escrever seus OKRs assim como os seus KPIs ... Preciso que você crie
-- também um ... diretor Industrial. Porque esse tem o mesmo privilégio e visualização do CEO. Mas o cargo é diferente."
-- Decisões dele (06/10): cada representante vê SÓ os seus indicadores; quem acompanha todos os representantes é quem
-- já vê tudo (o Edson, os admins de OKR, os CEOs e o Diretor Industrial) — mais ninguém.
--
-- O que faz:
--   1) users_role_check aceita DIRETOR_INDUSTRIAL e REPRESENTANTE.
--   2) public.cargo_visao_ceo(role) = CEO ou Diretor Industrial. As 5 funções que davam algo ao CEO pelo texto 'CEO'
--      passam a perguntar a ela: okr_is_ceo (lê o OKR de todos), kpis_ve_todos (todos os setores do KPI),
--      kpis_ve_reservado (o P&D), kpis_dono_ve (valor do KR ligado) e pode_ler_auditoria (o Log de Auditoria).
--      A troca é feita NO TEXTO DE PRODUÇÃO de cada função (pg_get_functiondef), trecho a trecho, conferindo que o
--      trecho existe UMA vez — o repositório não reproduz o banco (várias dessas funções só existem lá).
--   3) Fora da engenharia: o custo/hora (custo_hora_taxa_calculada) deixa de fora o Diretor e o Representante, como
--      o CEO e o PROCESSOS; a régua 'engenharia' do motor do KPI (kpis_calc_interno) deixa o Representante de fora,
--      como o PROCESSOS. Hoje NINGUÉM tem esses cargos: nenhum número muda (o ensaio prova).
--   4) Representante: o gatilho users_representante_molde força o molde "Somente OKR" (okr_only e okr_enabled; nunca
--      visualizador nem admin de OKR — a 029 tira a engenharia de quem tem okr_only) e o setor SÓ DELE,
--      'Representante — Nome Sobrenome' (cada um vê só os seus indicadores); dois representantes com o mesmo setor =
--      recusa, e ninguém que não é representante entra num setor de representante. O CHECK
--      users_representante_so_okr garante o molde mesmo se alguém gravar por fora do gatilho. E o gatilho RECUSA
--      representante enquanto a 029 não estiver no banco (sem ela, quem é "Somente OKR" ainda lê a engenharia pela
--      API): a ordem 029 → representantes deixa de depender de alguém lembrar. O Diretor não espera a 029.
--   5) Representante lê só a PRÓPRIA linha de users (como o visualizador) e, dos executores do OKR, só as EQUIPES: é
--      gente de fora — não leva nomes, e-mails e telefones de pessoas da empresa.
--   6) No setor de um representante só entra indicador LANÇADO À MÃO, grave quem gravar (o calculado lê a base da
--      engenharia — horas, projetos, paradas — e quem é do setor o veria); e o próprio representante não grava
--      calculado em lugar nenhum.
--
-- ORDEM: rodar DEPOIS do código novo no ar (o servidor tem de tratar o Diretor como cargo de topo antes de o banco
-- aceitar o cargo). Os representantes só ganham login DEPOIS da 029 (o gatilho do item 4 confere).
-- Tudo numa transação: qualquer trava = NADA gravado. Desfazer: 030_rollback.sql.
-- 🔴 DEPOIS DESTA, NÃO RODAR DE NOVO a 011, 022, 023, 026, 027 nem os rollbacks 026/027: eles recriam com 'CEO'
-- escrito à mão funções que esta ajusta (o Diretor sairia delas calado). Mudança nova parte do pg_get_functiondef
-- de produção. E o Diretor Industrial se cadastra SEM setor, como os CEOs (com setor, pela 028 ele passaria a
-- mexer nos indicadores daquele setor — além da visão do CEO).
-- Conferência no fim. Esperado: true · 5 · true · true · 2 · 2 · true · 0
-- =====================================================================================================

begin;

do $g$
begin
  if length('—') <> 1 then
    raise exception 'CARGOS 030: o texto chegou com os acentos quebrados — nada foi gravado. Copie o arquivo de novo.';
  end if;
  if to_regprocedure('public.kpis_excluir_indicador(uuid, integer)') is null
     or to_regprocedure('public.okr_is_ceo()') is null or to_regprocedure('public.custo_hora_taxa_calculada(date, text)') is null then
    raise exception 'CARGOS 030: faltam funções que esta migração ajusta (028, okr_is_ceo, custo/hora) — nada foi gravado.';
  end if;
  if to_regprocedure('public.cargo_visao_ceo(text)') is not null then
    raise exception 'CARGOS 030: já rodou (cargo_visao_ceo existe) — nada foi gravado.';
  end if;
end $g$;

-- 1) os cargos aceitos ------------------------------------------------------------------------------------------------
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role = any (array[
  'GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR', 'ADM_EXTERNO',
  'DIRETOR_INDUSTRIAL', 'REPRESENTANTE']::text[]));

-- 2) a visão do CEO, num lugar só ---------------------------------------------------------------------------------------
create function public.cargo_visao_ceo(p_role text) returns boolean
  language sql immutable parallel safe set search_path = public as $f$
  -- 030: CEO ou Diretor Industrial — "o mesmo privilégio e visualização do CEO" (Edson, 06/10).
  select coalesce(p_role, '') in ('CEO', 'DIRETOR_INDUSTRIAL')
$f$;

-- 2b + 3) as funções que decidem por cargo, ajustadas no texto de produção ------------------------------------------------
do $p$
declare
  t record;
  d text;
  n int;
begin
  for t in select * from (values
      ('public.okr_is_ceo()'::regprocedure,
       $a$role = 'CEO'$a$,
       $a$public.cargo_visao_ceo(role)$a$),
      ('public.kpis_ve_todos()'::regprocedure,
       $a$coalesce(u.role, '') = 'CEO'$a$,
       $a$public.cargo_visao_ceo(u.role)$a$),
      ('public.kpis_ve_reservado()'::regprocedure,
       $a$coalesce(u.role, '') = 'CEO'$a$,
       $a$public.cargo_visao_ceo(u.role)$a$),
      ('public.kpis_dono_ve(text, text)'::regprocedure,
       $a$when coalesce(u.role, '') = 'CEO' then true$a$,
       $a$when public.cargo_visao_ceo(u.role) then true$a$),
      ('public.pode_ler_auditoria()'::regprocedure,
       $a$role = any (array['GESTOR','CEO','COORDENADOR'])$a$,
       $a$(role = any (array['GESTOR','CEO','COORDENADOR']) or public.cargo_visao_ceo(role))$a$),
      ('public.custo_hora_taxa_calculada(date, text)'::regprocedure,
       $a$coalesce(u.role, '') not in ('CEO', 'PROCESSOS', 'ADM_EXTERNO')$a$,
       $a$coalesce(u.role, '') not in ('CEO', 'DIRETOR_INDUSTRIAL', 'PROCESSOS', 'ADM_EXTERNO', 'REPRESENTANTE')$a$),
      ('public.kpis_calc_interno(uuid, date, date)'::regprocedure,
       $a$coalesce(u.role, '') = 'PROCESSOS'$a$,
       $a$coalesce(u.role, '') in ('PROCESSOS', 'REPRESENTANTE')$a$)
    ) v(fn, velho, novo)
  loop
    d := pg_get_functiondef(t.fn);
    n := (length(d) - length(replace(d, t.velho, ''))) / length(t.velho);
    if n <> 1 then
      raise exception 'CARGOS 030: em % o trecho [%] aparece % vez(es) (esperava 1) — nada foi gravado.', t.fn, t.velho, n;
    end if;
    execute replace(d, t.velho, t.novo);
  end loop;
end $p$;

-- 4) o representante: molde "Somente OKR" e setor só dele -----------------------------------------------------------------
create function public.users_representante_molde() returns trigger
  language plpgsql set search_path = public as $f$
declare
  v_outro text;
begin
  -- 030: o REPRESENTANTE (vendedor, de fora da fábrica) é sempre "Somente OKR" — nunca visualizador nem admin de OKR —
  -- e tem um setor só dele ("cada um só os seus", Edson 06/10). O setor nasce do nome; quem muda o nome depois não
  -- muda o setor (os indicadores dele guardam o texto do setor).
  if coalesce(new.role, '') <> 'REPRESENTANTE' then
    -- e o setor de um representante é SÓ dele: ninguém mais entra nele (pela 028, quem é do setor vê e mexe nos
    -- indicadores do setor). Quem deixa de ser representante e não mexe no setor passa; o setor muda depois.
    if (tg_op = 'INSERT' or new.sector is distinct from old.sector)
       and coalesce(public.kpis_setor_chave(new.sector), '') ~ '^representante( |$)' then
      raise exception 'USERS_SETOR_DE_REPRESENTANTE: o setor "%" é de um representante — só ele fica nesse setor.', new.sector
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  if new.id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid then
    raise exception 'USERS_REPRESENTANTE: o Edson nunca é representante.' using errcode = 'P0001';
  end if;
  -- …e só depois da 029: sem ela, o "Somente OKR" ainda lê e grava a engenharia pela API (e o R$ dos projetos).
  -- Conferido quando a pessoa PASSA a ser representante (editar quem já é não trava; o 029_rollback recusa com
  -- representante cadastrado).
  if (tg_op = 'INSERT' or old.role is distinct from 'REPRESENTANTE') and to_regprocedure('public.e_somente_okr()') is null then
    raise exception 'USERS_REPRESENTANTE_SEM_029: aplique a 029 antes de criar representante (sem ela, quem é "Somente OKR" ainda lê a engenharia).'
      using errcode = 'P0001';
  end if;
  new.okr_only := true;
  new.okr_enabled := true;
  new.okr_viewer := false;
  new.okr_admin := false;
  if new.sector is null or new.sector not like 'Representante — %' then
    new.sector := 'Representante — ' || btrim(regexp_replace(coalesce(new.name, '') || ' ' || coalesce(new.surname, ''), '\s+', ' ', 'g'));
  end if;
  select u.username into v_outro
    from public.users u
   where u.id <> new.id and public.kpis_setor_chave(u.sector) = public.kpis_setor_chave(new.sector)
   limit 1;
  if v_outro is not null then
    raise exception 'USERS_REPRESENTANTE_HOMONIMO: o setor "%" já é de outra pessoa (login %) — diferencie pelo sobrenome.',
      new.sector, v_outro using errcode = 'P0001';
  end if;
  return new;
end $f$;
revoke all on function public.users_representante_molde() from public, anon, authenticated;

create trigger users_representante_molde
  before insert or update on public.users
  for each row execute function public.users_representante_molde();

alter table public.users add constraint users_representante_so_okr check (
  role <> 'REPRESENTANTE'
  or (okr_only and okr_enabled and not okr_viewer and not okr_admin
      and sector like 'Representante — %' and id <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid));

-- 5) o representante lê só a própria linha do cadastro --------------------------------------------------------------------
create function public.e_representante() returns boolean
  language sql stable security definer set search_path = public as $f$
  -- 030: quem está logado é REPRESENTANTE? Lido do CADASTRO na hora (nunca do crachá).
  select exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'REPRESENTANTE')
$f$;
revoke all on function public.e_representante() from public, anon;
grant execute on function public.e_representante() to authenticated, service_role;

create policy representante_so_a_propria_linha on public.users
  as restrictive for select to authenticated
  using (id = auth.uid() or not (select public.e_representante()));

-- …e, dos executores do OKR (quem pode ser responsável por um KR), só as equipes: as pessoas são nomes da empresa.
create policy representante_sem_executores on public.okr_executor
  as restrictive for select to authenticated
  using (coalesce(kind, '') = 'equipe' or not (select public.e_representante()));

-- 6) no setor do representante, só indicador lançado à mão ----------------------------------------------------------------
create function public.kpis_indicador_representante() returns trigger
  language plpgsql security definer set search_path = public as $f$
begin
  -- 030: o calculado lê a base da engenharia (horas, projetos, paradas, inovações, cronograma) — não é para quem é
  -- de fora. O representante cria, edita, põe meta, lança e exclui os do setor dele, sempre lançados à mão. Vale
  -- para QUEM GRAVA (o Edson ou um admin de OKR também não põe calculado no setor de um representante: quem é do
  -- setor veria a série) e para o próprio representante, em qualquer setor.
  if new.tipo = 'calculado'
     and (coalesce(public.kpis_setor_chave(new.setor), '') ~ '^representante( |$)' or (select public.e_representante())) then
    raise exception 'KPIS_REPRESENTANTE_SO_MANUAL: no setor de um representante só entra indicador lançado à mão (o calculado lê a base da engenharia).'
      using errcode = 'P0001';
  end if;
  return new;
end $f$;
revoke all on function public.kpis_indicador_representante() from public, anon, authenticated;

create trigger kpis_indicador_representante
  before insert or update on public.kpis_indicador
  for each row execute function public.kpis_indicador_representante();

commit;

notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: true · 5 · true · true · 2 · 2 · true · 0
select
  (select pg_get_constraintdef(c.oid) like '%DIRETOR_INDUSTRIAL%' and pg_get_constraintdef(c.oid) like '%REPRESENTANTE%'
     from pg_constraint c where c.conname = 'users_role_check' and c.conrelid = 'public.users'::regclass)          as cargos_novos,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosrc like '%cargo_visao_ceo(%')                                              as funcoes_diretor,
  (select prosrc like '%''DIRETOR_INDUSTRIAL'', ''PROCESSOS'', ''ADM_EXTERNO'', ''REPRESENTANTE''%' from pg_proc
    where oid = 'public.custo_hora_taxa_calculada(date, text)'::regprocedure)                                       as custo_hora_sem_eles,
  (select prosrc like '%in (''PROCESSOS'', ''REPRESENTANTE'')%' from pg_proc
    where oid = 'public.kpis_calc_interno(uuid, date, date)'::regprocedure)                                          as regua_sem_representante,
  (select count(*) from pg_trigger where tgname in ('users_representante_molde', 'kpis_indicador_representante'))   as gatilhos,
  (select count(*) from pg_policies where schemaname = 'public'
    and policyname in ('representante_so_a_propria_linha', 'representante_sem_executores'))                         as politicas,
  (select count(*) = 1 from pg_constraint where conname = 'users_representante_so_okr')                             as check_representante,
  (select count(*) from public.users where role in ('DIRETOR_INDUSTRIAL', 'REPRESENTANTE'))                          as pessoas_nos_cargos_novos;
