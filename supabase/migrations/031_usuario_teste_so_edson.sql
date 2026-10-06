-- =====================================================================================================
-- 031 — USUÁRIO DE TESTE (treinamento): tudo dele visível SÓ ao Edson e a ele mesmo (06/10/2026)
--
-- Pedido do Edson (06/10): um usuário TESTE para o treinamento de hoje à tarde, e tudo o que é dele — o cadastro, o
-- OKR, os indicadores do setor dele, a agenda e o Log de Auditoria — visível só para o Edson e para o próprio teste.
-- Decisão dele: ninguém mais — nem os admins de OKR, nem o CEO / Diretor Industrial, nem o visualizador, nem
-- GESTOR / COORDENADOR (o P&D reservado não serve de molde: lá o CEO e o Diretor veem).
--
-- O que faz (nada é afrouxado; só se acrescentam "E"):
--   1) users.usuario_teste (boolean, padrão false) = a marca. A tela lê a coluna (grant de coluna; quem não é o Edson
--      nem o teste só enxerga linhas com false). Escrever, só o servidor (a RLS de users já nega escrita à tela).
--   2) Funções novas: usuarios_teste_ids() e usuarios_teste_chaves() (os ids e os logins marcados; definer, para as
--      políticas não caírem em recursão), kpis_indicadores_so_edson() (os indicadores do setor "Teste", para a
--      auditoria) e kpis_setor_so_edson(setor) (imutável, chave 'teste' — o mesmo molde do kpis_setor_reservado).
--   3) Políticas RESTRICTIVE: users (a linha do teste), okr_state (o OKR dele, leitura e escrita), audit_logs (o que
--      ele fez, o que foi feito no cadastro dele, no OKR dele, nos indicadores do setor dele e a exclusão de indicador
--      do setor dele, que passa a ser gravada como KPI_INDICADOR_TESTE) e kpis_indicador
--      (defesa extra; meta, lançamento e histórico herdam pelo EXISTS da política de leitura deles).
--   4) Oito funções existentes ganham um "E", trocado NO TEXTO DE PRODUÇÃO (pg_get_functiondef), trecho a trecho,
--      conferindo que o trecho aparece UMA vez — o repositório não reproduz o banco:
--        kpis_vejo_setor      (o ramo "vê todos" não alcança o setor Teste — fecha leitura, meta, lançamento,
--                              gerência, criação e série para admin de OKR, CEO e Diretor)
--        kpis_dono_ve         (o setor Teste só vale para quem é dele — o Edson já é a 1ª linha)
--        kpis_setores         (o setor Teste não aparece na lista de quem vê todos, salvo o Edson)
--        kpis_valores_ligados (valor do KR ligado a indicador do Teste: nunca pelo link público; logado, só quem vê)
--        okr_pessoas          (o visualizador não recebe o teste na lista de donos de OKR)
--        agenda_ocupado       (o "ocupado" do teste só para o Edson e para ele mesmo; e compromisso do teste não
--                              conta como "ocupado" de ninguém para os outros)
--        agenda_item_antes    (compromisso com o teste — dono ou participante — só tem o Edson e o próprio teste:
--                              senão o convite sairia por e-mail a outra pessoa com "Usuário Teste", e o nome dele
--                              iria na lista de participantes do e-mail de todos; recusa com AGENDA_TESTE)
--        kpis_excluir_indicador (a exclusão de indicador do setor Teste vai ao Log como KPI_INDICADOR_TESTE: depois
--                              de excluído o id já não está em kpis_indicadores_so_edson, e a linha apareceria)
--   5) Gatilho users_teste_molde: o setor "Teste" é só de quem tem a marca (senão a pessoa veria tudo pelo "meu
--      setor"); e quem tem a marca nunca é o Edson, é sempre PROCESSOS ("Somente OKR": nunca GESTOR / COORDENADOR /
--      CEO / Diretor, que abririam a auditoria e o "vê todos"), fica no setor "Teste", e o banco força okr_only e
--      okr_enabled = true, okr_admin e okr_viewer = false.
--
-- ORDEM: (a) o código do servidor que filtra o teste (painel público do OKR, link de compartilhar, /api/users/*)
-- no ar — a service_role passa por cima da RLS; (b) esta 031; (c) SÓ ENTÃO criar o usuário, já com
-- usuario_teste = true (ele nunca aparece a ninguém, nem por um instante); (d) os dados fictícios.
-- Tudo numa transação: qualquer trava = NADA gravado. Desfazer: 031_rollback.sql (recusa com usuário de teste
-- cadastrado ou indicador no setor Teste).
-- ⏱ Espera no máximo 5 s por trava de tabela (lock_timeout, como a 029): users, okr_state, audit_logs e kpis_indicador
-- ficam presas enquanto esta roda, e o app desiste em 8 s. Se der "canceling statement due to lock timeout", NADA foi
-- gravado — confira que nenhum ensaio / consulta longa está rodando e cole de novo.
-- 🔴 DEPOIS DESTA, NÃO RODAR DE NOVO a 012, 016, 023, 026, 027, 028 nem os rollbacks 026/027/030: eles recriam à mão
-- funções que esta ajusta (o teste voltaria a aparecer calado). Desfazer a 030 só depois do 031_rollback.
-- 🔴 NUNCA EXCLUIR o teste pela Equipe: a marca some com a linha e o que sobrar dele (log, OKR arquivado
-- "excluido:…") volta a aparecer. Para encerrar: apagar os dados dele (decisão do Edson) e depois o cadastro.
-- Conferência no fim. Esperado: 1 · true · true · 5 · 4 · 8 · 1 · 0
-- =====================================================================================================

begin;
set local lock_timeout = '5s';

do $g$
declare n int;
begin
  if length('—') <> 1 then
    raise exception 'USUARIO TESTE 031: o texto chegou com os acentos quebrados — nada foi gravado. Copie o arquivo de novo.';
  end if;
  if to_regprocedure('public.cargo_visao_ceo(text)') is null then
    raise exception 'USUARIO TESTE 031: a 030 não está no banco (cargo_visao_ceo) — nada foi gravado.';
  end if;
  if to_regprocedure('public.kpis_vejo_setor(text)') is null or to_regprocedure('public.kpis_dono_ve(text, text)') is null
     or to_regprocedure('public.kpis_setores()') is null or to_regprocedure('public.kpis_valores_ligados(jsonb)') is null
     or to_regprocedure('public.okr_pessoas()') is null
     or to_regprocedure('public.agenda_ocupado(uuid[], timestamp with time zone, timestamp with time zone, uuid)') is null
     or to_regprocedure('public.is_edson()') is null or to_regprocedure('public.okr_my_key()') is null
     or to_regprocedure('public.kpis_meu_setor()') is null or to_regprocedure('public.kpis_setor_chave(text)') is null
     or to_regprocedure('public.kpis_vejo_indicador(uuid)') is null
     or to_regprocedure('public.agenda_item_antes()') is null
     or to_regprocedure('public.kpis_excluir_indicador(uuid, integer)') is null then
    raise exception 'USUARIO TESTE 031: faltam funções que esta migração ajusta ou usa (KPI dos setores, OKR, agenda) — nada foi gravado.';
  end if;
  if to_regprocedure('public.usuarios_teste_ids()') is not null
     or exists (select 1 from pg_attribute where attrelid = 'public.users'::regclass and attname = 'usuario_teste' and not attisdropped) then
    raise exception 'USUARIO TESTE 031: já rodou (users.usuario_teste / usuarios_teste_ids existem) — nada foi gravado.';
  end if;
  select count(*) into n from public.users where lower(btrim(username)) = 'teste' or public.kpis_setor_chave(sector) = 'teste';
  if n > 0 then
    raise exception 'USUARIO TESTE 031: já existe login "teste" ou alguém no setor Teste (% pessoa(s)) — sem a marca ficaria à vista de todos. Nada foi gravado.', n;
  end if;
  select count(*) into n from public.kpis_indicador where public.kpis_setor_chave(setor) = 'teste';
  if n > 0 then
    raise exception 'USUARIO TESTE 031: já há % indicador(es) no setor Teste — o setor nasce com esta migração. Nada foi gravado.', n;
  end if;
end $g$;

-- 1) a marca ------------------------------------------------------------------------------------------------------------
alter table public.users add column usuario_teste boolean not null default false;
-- o grant deixa a tela PODER ler a marca; hoje ela NÃO lê (a Equipe do Edson mostra o teste como um PROCESSOS comum,
-- sem selo — o selo fica para depois). Quem lê hoje: o servidor e as políticas. Nunca para anon. A escrita segue só
-- pelo servidor (RLS).
grant select (usuario_teste) on public.users to authenticated;

-- 2) quem é teste, lido do CADASTRO na hora ------------------------------------------------------------------------------
create function public.usuarios_teste_ids() returns uuid[]
  language sql stable security definer set search_path = public as $f$
  -- 031: os ids marcados como usuário de teste (as políticas escondem o que é deles de quem não é o Edson).
  select coalesce(array_agg(u.id order by u.id), '{}'::uuid[]) from public.users u where u.usuario_teste
$f$;
revoke all on function public.usuarios_teste_ids() from public, anon;
grant execute on function public.usuarios_teste_ids() to authenticated, service_role;

create function public.usuarios_teste_chaves() returns text[]
  language sql stable security definer set search_path = public as $f$
  -- 031: os logins (owner_key do OKR) dos usuários de teste.
  select coalesce(array_agg(lower(btrim(u.username)) order by lower(btrim(u.username))), '{}'::text[])
    from public.users u where u.usuario_teste
$f$;
revoke all on function public.usuarios_teste_chaves() from public, anon;
grant execute on function public.usuarios_teste_chaves() to authenticated, service_role;

create function public.kpis_setor_so_edson(p_setor text) returns boolean
  language sql immutable set search_path = public as $f$
  -- 031: setor que só o Edson e quem é dele enxergam (o do usuário de teste). Mesmo molde do kpis_setor_reservado.
  select coalesce(public.kpis_setor_chave(p_setor) = any (array['teste']), false)
$f$;
revoke all on function public.kpis_setor_so_edson(text) from public, anon;
grant execute on function public.kpis_setor_so_edson(text) to authenticated, service_role;

create function public.kpis_indicadores_so_edson() returns uuid[]
  language sql stable security definer set search_path = public as $f$
  -- 031: os indicadores do setor Teste (a auditoria esconde as linhas deles enquanto existirem).
  select coalesce(array_agg(i.id order by i.id), '{}'::uuid[]) from public.kpis_indicador i where public.kpis_setor_so_edson(i.setor)
$f$;
revoke all on function public.kpis_indicadores_so_edson() from public, anon;
grant execute on function public.kpis_indicadores_so_edson() to authenticated, service_role;

-- 3) as políticas RESTRICTIVE (somam-se às de hoje; nenhuma é afrouxada) ------------------------------------------------
create policy usuario_teste_so_edson on public.users
  as restrictive for select to authenticated
  using (id = (select auth.uid()) or not usuario_teste or (select public.is_edson()));

create policy okr_teste_so_edson on public.okr_state
  as restrictive for all to authenticated
  using ((select public.is_edson()) or owner_key = (select public.okr_my_key())
         or not coalesce(owner_key = any ((select public.usuarios_teste_chaves())::text[]), false))
  with check ((select public.is_edson()) or owner_key = (select public.okr_my_key())
              or not coalesce(owner_key = any ((select public.usuarios_teste_chaves())::text[]), false));

create policy audit_teste_so_edson on public.audit_logs
  as restrictive for select to authenticated
  using ((select public.is_edson()) or user_id = (select auth.uid())
         or not (coalesce(user_id = any ((select public.usuarios_teste_ids())::uuid[]), false)
                 or coalesce(lower(entity_id) = any (((select public.usuarios_teste_ids()))::text[]), false)
                 or (entity_type = 'OKR' and coalesce(lower(entity_id) = any ((select public.usuarios_teste_chaves())::text[]), false))
                 or (entity_type = 'KPI_INDICADOR'
                     and coalesce(lower(entity_id) = any (((select public.kpis_indicadores_so_edson()))::text[]), false))
                 or entity_type = 'KPI_INDICADOR_TESTE'));

create policy kpis_teste_so_edson on public.kpis_indicador
  as restrictive for all to authenticated
  using (not public.kpis_setor_so_edson(setor) or (select public.is_edson())
         or coalesce(public.kpis_setor_chave(setor) = (select public.kpis_meu_setor()), false))
  with check (not public.kpis_setor_so_edson(setor) or (select public.is_edson())
              or coalesce(public.kpis_setor_chave(setor) = (select public.kpis_meu_setor()), false));

-- 4) as funções que enxergam por cima da RLS, ajustadas no texto de produção --------------------------------------------
do $p$
declare
  t record;
  d text;
  n int;
begin
  for t in select * from (values
      ('public.kpis_vejo_setor(text)'::regprocedure,
       $a$(not public.kpis_setor_reservado(p_setor) or public.kpis_ve_reservado())$a$,
       $a$(not public.kpis_setor_reservado(p_setor) or public.kpis_ve_reservado()) and (not public.kpis_setor_so_edson(p_setor) or public.is_edson())$a$),
      ('public.kpis_dono_ve(text, text)'::regprocedure,
       $a$when public.cargo_visao_ceo(u.role) then true$a$,
       $a$when public.kpis_setor_so_edson(p_setor) then public.kpis_setor_chave(u.sector) = public.kpis_setor_chave(p_setor) when public.cargo_visao_ceo(u.role) then true$a$),
      ('public.kpis_setores()'::regprocedure,
       $a$and (not public.kpis_setor_reservado(u.sector) or public.kpis_ve_reservado())$a$,
       $a$and (not public.kpis_setor_reservado(u.sector) or public.kpis_ve_reservado()) and (not public.kpis_setor_so_edson(u.sector) or public.is_edson())$a$),
      ('public.kpis_valores_ligados(jsonb)'::regprocedure,
       $a$and public.kpis_dono_ve(p.p_dono, i.setor)$a$,
       $a$and public.kpis_dono_ve(p.p_dono, i.setor) and (not public.kpis_setor_so_edson(i.setor) or (not v_servidor and public.kpis_vejo_indicador(i.id)))$a$),
      ('public.okr_pessoas()'::regprocedure,
       $a$where (select public.okr_is_viewer())$a$,
       $a$where (select public.okr_is_viewer()) and (not coalesce(u.usuario_teste, false) or (select public.is_edson()) or u.id = auth.uid())$a$),
      ('public.agenda_ocupado(uuid[], timestamp with time zone, timestamp with time zone, uuid)'::regprocedure,
       $a$where x is not null), '{}'::uuid[]);$a$,
       $a$where x is not null), '{}'::uuid[]); if not public.is_edson() then v_pessoas := coalesce(array(select y from unnest(v_pessoas) as y where y = auth.uid() or not (y = any (public.usuarios_teste_ids()))), '{}'::uuid[]); end if;$a$),
      -- compromisso do teste não vira "ocupado" do convidado (o Edson) para os outros
      ('public.agenda_ocupado(uuid[], timestamp with time zone, timestamp with time zone, uuid)'::regprocedure,
       $a$and x.p = any (v_pessoas)$a$,
       $a$and x.p = any (v_pessoas) and ((select public.is_edson()) or i.owner_id = auth.uid() or not (i.owner_id = any ((select public.usuarios_teste_ids())::uuid[])))$a$),
      -- compromisso com o teste (dono ou participante): só o Edson e o próprio teste — senão sai e-mail a outra pessoa
      ('public.agenda_item_antes()'::regprocedure,
       $a$return new;$a$,
       $a$if (new.owner_id = any (public.usuarios_teste_ids()) or new.participantes && public.usuarios_teste_ids()) and exists (select 1 from unnest(array[new.owner_id] || new.participantes) as q where q <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid and not (q = any (public.usuarios_teste_ids()))) then raise exception 'AGENDA_TESTE: compromisso com o usuário de teste só pode ter o Edson e o próprio teste. Nada foi gravado.' using errcode = 'P0001'; end if; return new;$a$),
      -- exclusão de indicador do setor Teste: o Log a grava com um tipo que a política esconde (o id some com o indicador)
      ('public.kpis_excluir_indicador(uuid, integer)'::regprocedure,
       $a$'DELETE', 'KPI_INDICADOR', p_indicador::text,$a$,
       $a$'DELETE', case when public.kpis_setor_so_edson(v_ind.setor) then 'KPI_INDICADOR_TESTE' else 'KPI_INDICADOR' end, p_indicador::text,$a$)
    ) v(fn, velho, novo)
  loop
    d := pg_get_functiondef(t.fn);
    n := (length(d) - length(replace(d, t.velho, ''))) / length(t.velho);
    if n <> 1 then
      raise exception 'USUARIO TESTE 031: em % o trecho [%] aparece % vez(es) (esperava 1) — nada foi gravado.', t.fn, t.velho, n;
    end if;
    execute replace(d, t.velho, t.novo);
  end loop;
end $p$;

-- 5) o molde do usuário de teste --------------------------------------------------------------------------------------------
create function public.users_teste_molde() returns trigger
  language plpgsql set search_path = public as $f$
begin
  -- 031: o setor "Teste" é SÓ de quem tem a marca (quem é do setor vê e mexe nos indicadores dele pela 028).
  if not coalesce(new.usuario_teste, false) then
    if public.kpis_setor_so_edson(new.sector) then
      raise exception 'USERS_SETOR_DE_TESTE: o setor "%" é só do usuário de teste — ninguém mais entra nele.', new.sector
        using errcode = 'P0001';
    end if;
    return new;
  end if;
  -- …e quem tem a marca é sempre um "Somente OKR" comum, no setor Teste.
  if new.id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid then
    raise exception 'USERS_TESTE_EDSON: o Edson nunca é usuário de teste.' using errcode = 'P0001';
  end if;
  if coalesce(new.role, '') <> 'PROCESSOS' then
    raise exception 'USERS_TESTE_CARGO: o usuário de teste é sempre PROCESSOS ("Somente OKR") — cargo "%" recusado.', new.role
      using errcode = 'P0001';
  end if;
  if not public.kpis_setor_so_edson(new.sector) then
    raise exception 'USERS_TESTE_SETOR: o usuário de teste fica no setor "Teste" (veio "%").', coalesce(new.sector, 'sem setor')
      using errcode = 'P0001';
  end if;
  new.okr_only := true;
  new.okr_enabled := true;
  new.okr_admin := false;
  new.okr_viewer := false;
  return new;
end $f$;
revoke all on function public.users_teste_molde() from public, anon, authenticated;

create trigger users_teste_molde
  before insert or update on public.users
  for each row execute function public.users_teste_molde();

commit;

notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: 1 · true · true · 5 · 4 · 8 · 1 · 0
select
  (select count(*) from pg_attribute where attrelid = 'public.users'::regclass and attname = 'usuario_teste' and not attisdropped) as coluna,
  has_column_privilege('authenticated', 'public.users', 'usuario_teste', 'SELECT')                                       as tela_le_a_marca,
  not has_column_privilege('anon', 'public.users', 'usuario_teste', 'SELECT')                                            as anon_nao_le,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
     and p.proname in ('usuarios_teste_ids', 'usuarios_teste_chaves', 'kpis_setor_so_edson', 'kpis_indicadores_so_edson',
                       'users_teste_molde'))                                                                            as funcoes_novas,
  (select count(*) from pg_policies where schemaname = 'public' and permissive = 'RESTRICTIVE'
     and policyname in ('usuario_teste_so_edson', 'okr_teste_so_edson', 'audit_teste_so_edson', 'kpis_teste_so_edson')) as politicas,
  (select count(*) from pg_proc p
    where p.oid in ('public.kpis_vejo_setor(text)'::regprocedure, 'public.kpis_dono_ve(text, text)'::regprocedure,
                    'public.kpis_setores()'::regprocedure, 'public.kpis_valores_ligados(jsonb)'::regprocedure,
                    'public.okr_pessoas()'::regprocedure,
                    'public.agenda_ocupado(uuid[], timestamp with time zone, timestamp with time zone, uuid)'::regprocedure,
                    'public.agenda_item_antes()'::regprocedure, 'public.kpis_excluir_indicador(uuid, integer)'::regprocedure)
      and (strpos(p.prosrc, 'kpis_setor_so_edson(') > 0 or strpos(p.prosrc, 'usuarios_teste_ids()') > 0
           or strpos(p.prosrc, 'u.usuario_teste') > 0))                                                                 as funcoes_ajustadas,
  (select count(*) from pg_trigger where tgname = 'users_teste_molde' and tgrelid = 'public.users'::regclass)          as gatilho,
  (select count(*) from public.users where usuario_teste)                                                                as usuarios_de_teste;
