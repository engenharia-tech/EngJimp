-- =====================================================================================================
-- 032 — "ADMINISTRA USUÁRIOS" (TI): a marca users.admin_usuarios, ligada SÓ no Luiz Henrique (07/10/2026)
--
-- Pedido do Edson (07/10): "a gente criou o usuário do Luiz, que é da TI, e eu preciso que você dê permissão para ele
-- criar o usuário, excluir o usuário, exceto o meu. O meu é impossível excluir porque eu sou proprietário. … sem que
-- ele possa ver os salários. Essa informação nunca está aberta para ele, porque ele simplesmente é da TI."
-- Decisões dele (07/10): uma MARCA, não um cargo (GESTOR/COORDENADOR abririam a engenharia e o R$, e salário 0 puxaria
-- o custo/hora); só o Edson dá ou tira a marca; quem a tem cria/edita só cargos comuns, exclui e desliga todos menos o
-- Edson e o teste, define o setor menos P&D/Teste, NÃO troca e-mail, login nem senha de conta existente (trocar e-mail
-- ou gerar código = tomar a conta), não edita contas altas, e conta que ele cria nasce SEM senha (a pessoa cria a dela
-- pelo código no e-mail). Nunca vê salário, R$, custo/hora nem o Log de Auditoria. Quem decide tudo isso é o SERVIDOR
-- (/api/users/*, lendo a marca no cadastro na hora); o banco guarda a marca e as travas abaixo.
--
-- Antes: só GESTOR, COORDENADOR e o Edson administravam pessoas (o servidor, pelo cargo).
-- Agora:
--   1) users.admin_usuarios (boolean, padrão false) = a marca. A tela lê (grant de COLUNA — nunca de tabela: abriria o
--      salário) para abrir a Equipe a quem a tem; o login também a devolve. Escrever, só o servidor (a RLS de users não
--      tem política de escrita para a tela).
--   2) CHECK users_admin_usuarios_so_comuns: a marca só existe em PROJETISTA, PROCESSOS ou QUALIDADE, nunca em
--      visualizador (okr_viewer) nem no Edson. Por quê: a marca é PODER SOBRE PESSOAS — em GESTOR/COORDENADOR seria
--      redundante e, no COORDENADOR, ainda o deixaria excluir GESTOR e CEO (que hoje ele não exclui); no CEO e no
--      Diretor Industrial contraria "só visão macro" (01/10); no visualizador, "não grava nada"; no representante, gente
--      de fora que só lê a própria linha de users. O Edson não precisa dela. Quem passa a cargo alto perde a marca antes
--      (o servidor avisa com a frase; se algo escapar, o banco recusa com erro — nunca calado).
--   3) Gatilho users_teste_molde (031) ganha um "E": o usuário de teste nunca tem a marca (forçada false, como o
--      okr_admin) — troca NO TEXTO DE PRODUÇÃO (pg_get_functiondef), conferindo que o trecho aparece UMA vez.
--   4) Gatilho users_senha_sorteada: conta INSERIDA com must_set_password e SEM senha (password vazio, sem hash) recebe
--      um hash bcrypt de um valor sorteado que ninguém conhece (o mesmo crypt/gen_salt da 020 e do seed do teste). É o
--      caminho do servidor para a conta que o TI cria: a senha digitada é ignorada, e a pessoa cria a dela em
--      "Criar / redefinir senha" (set_password_with_code). Nenhuma outra gravação passa por ele.
--   5) Liga a marca SÓ no luiz.henrique, pelo id a82c6480-d4d3-4ef7-b108-2ce9b1b1ceb2 (lido no banco em 07/10, só
--      leitura), com trava: exatamente 1 linha, login luiz.henrique, PROCESSOS, setor TI, não desligado, não teste.
--   6) A tela passa a ler users.okr_admin (grant de COLUNA, só o sim/não "é admin de OKR" — decisão do Edson, 07/10):
--      a Equipe do TI mostra o cadeado no admin de OKR de cargo comum (o Nascimento, PROCESSOS) em vez de oferecer
--      "Editar" e deixar o servidor recusar com 403. Antes a coluna existia sem leitura para a tela (lido em 07/10:
--      authenticated lê 15 colunas de users, okr_admin não). A trava do começo recusa se alguém já a tiver dado (o
--      desfazer revoga exatamente esta e só esta). Nunca grant de TABELA (abriria salário e senha).
--
-- O aviso ao Edson a cada mudança do TI (decisão de 07/10, "E-mail para mim a cada mudança") é do SERVIDOR
-- (api/index.ts, avisarEdsonDoTI): não precisa de nada do banco além do Log de Auditoria que já existe.
--
-- ORDEM: qualquer uma (código antes ou depois). Sem a 032 o servidor novo lê "coluna inexistente" = ninguém tem a
-- marca (o Luiz recebe 403 como hoje); com a 032 e o servidor antigo, a marca não abre nada.
-- Tudo numa transação: qualquer trava = NADA gravado. Desfazer: 032_rollback.sql (tira a marca do Luiz junto).
-- ⏱ Espera no máximo 5 s por trava de tabela (lock_timeout): users fica presa enquanto esta roda e o app desiste em
-- 8 s. Se der "canceling statement due to lock timeout", NADA foi gravado — cole de novo.
-- 🔴 DEPOIS DESTA: desfazer a 031 só depois do 032_rollback. E nunca GRANT SELECT na tabela users inteira.
-- Conferência no fim. Esperado: 1 · true · true · true · true · true · 1 · true · 1 · 1 · luiz.henrique
-- =====================================================================================================

begin;
set local lock_timeout = '5s';

do $g$
declare n int;
begin
  if length('—') <> 1 then
    raise exception 'ADMIN USUARIOS 032: o texto chegou com os acentos quebrados — nada foi gravado. Copie o arquivo de novo.';
  end if;
  if to_regprocedure('public.cargo_visao_ceo(text)') is null or to_regprocedure('public.users_teste_molde()') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.users'::regclass and attname = 'usuario_teste' and not attisdropped)
     or to_regprocedure('public.kpis_setor_chave(text)') is null then
    raise exception 'ADMIN USUARIOS 032: a 030 e a 031 têm de estar no banco antes (cargo_visao_ceo, users_teste_molde, users.usuario_teste) — nada foi gravado.';
  end if;
  if to_regprocedure('extensions.crypt(text, text)') is null or to_regprocedure('extensions.gen_salt(text)') is null then
    raise exception 'ADMIN USUARIOS 032: o pgcrypto (extensions.crypt / gen_salt) não está no banco — nada foi gravado.';
  end if;
  if exists (select 1 from pg_attribute where attrelid = 'public.users'::regclass and attname = 'admin_usuarios' and not attisdropped)
     or to_regprocedure('public.users_senha_sorteada()') is not null then
    raise exception 'ADMIN USUARIOS 032: já rodou (users.admin_usuarios / users_senha_sorteada existem) — nada foi gravado.';
  end if;
  -- a leitura de okr_admin pela tela é desta migração: se já existe (ou se users inteira está aberta), o desfazer não
  -- saberia o que devolver — para e avisa.
  if has_table_privilege('authenticated', 'public.users', 'SELECT')
     or has_column_privilege('authenticated', 'public.users', 'okr_admin', 'SELECT') then
    raise exception 'ADMIN USUARIOS 032: a tela já lê users.okr_admin (ou a tabela users inteira) — esperava que não. Nada foi gravado; chame o Claude.';
  end if;
  select count(*) into n from public.users
   where id = 'a82c6480-d4d3-4ef7-b108-2ce9b1b1ceb2'::uuid and lower(btrim(username)) = 'luiz.henrique' and role = 'PROCESSOS'
     and public.kpis_setor_chave(sector) = 'ti' and desligado_em is null and not usuario_teste and not okr_viewer;
  if n <> 1 then
    raise exception 'ADMIN USUARIOS 032: não achei exatamente 1 cadastro do Luiz Henrique (id a82c6480…, login luiz.henrique, PROCESSOS, setor TI, ativo) — achei %. Nada foi gravado.', n;
  end if;
end $g$;

-- 1) a marca ------------------------------------------------------------------------------------------------------------
alter table public.users add column admin_usuarios boolean not null default false;
-- só a COLUNA (a tela abre a Equipe a quem tem a marca). Nunca para anon. A escrita segue só pelo servidor (RLS).
grant select (admin_usuarios) on public.users to authenticated;
-- 6) …e o sim/não "é admin de OKR" (a Equipe do TI põe o cadeado no Nascimento). Também só a COLUNA, só authenticated.
grant select (okr_admin) on public.users to authenticated;

-- 2) a marca só em cargo comum -------------------------------------------------------------------------------------------
alter table public.users add constraint users_admin_usuarios_so_comuns check (
  not admin_usuarios
  or (role in ('PROJETISTA', 'PROCESSOS', 'QUALIDADE') and not okr_viewer
      and id <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid));

-- 3) o usuário de teste nunca administra usuários (031, no texto de produção) ---------------------------------------------
do $p$
declare
  d text;
  n int;
  velho constant text := $a$new.okr_viewer := false;$a$;
  novo constant text := $a$new.okr_viewer := false;
  new.admin_usuarios := false;$a$;
begin
  d := pg_get_functiondef('public.users_teste_molde()'::regprocedure);
  n := (length(d) - length(replace(d, velho, ''))) / length(velho);
  if n <> 1 then
    raise exception 'ADMIN USUARIOS 032: em users_teste_molde o trecho [%] aparece % vez(es) (esperava 1) — nada foi gravado.', velho, n;
  end if;
  execute replace(d, velho, novo);
end $p$;

-- 4) conta nova sem senha: o banco sorteia um hash que ninguém conhece ---------------------------------------------------
create function public.users_senha_sorteada() returns trigger
  language plpgsql set search_path = public, extensions as $f$
begin
  -- 032: a conta que o TI cria chega SEM senha (password vazio, sem hash) e com must_set_password. Fica um hash bcrypt de
  -- um valor sorteado e jogado fora — ninguém entra com senha nenhuma; a pessoa cria a dela pelo código no e-mail
  -- (set_password_with_code). Quem chega com senha ou com hash passa intocado.
  if coalesce(new.must_set_password, false) and coalesce(new.password, '') = '' and coalesce(new.password_hash, '') = '' then
    new.password := '';
    new.password_hash := extensions.crypt(gen_random_uuid()::text || clock_timestamp()::text || random()::text,
                                          extensions.gen_salt('bf'));
  end if;
  return new;
end $f$;
revoke all on function public.users_senha_sorteada() from public, anon, authenticated;

create trigger users_senha_sorteada
  before insert on public.users
  for each row execute function public.users_senha_sorteada();

-- 5) a marca no Luiz Henrique (TI), pelo id ------------------------------------------------------------------------------
do $l$
declare n int;
begin
  update public.users set admin_usuarios = true
   where id = 'a82c6480-d4d3-4ef7-b108-2ce9b1b1ceb2'::uuid and lower(btrim(username)) = 'luiz.henrique' and role = 'PROCESSOS'
     and public.kpis_setor_chave(sector) = 'ti' and desligado_em is null and not usuario_teste;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'ADMIN USUARIOS 032: a marca entraria em % cadastro(s) (esperava 1, o Luiz Henrique) — nada foi gravado.', n;
  end if;
end $l$;

commit;

notify pgrst, 'reload schema';

-- CONFERÊNCIA (só lê). Esperado: 1 · true · true · true · true · true · 1 · true · 1 · 1 · luiz.henrique
select
  (select count(*) from pg_attribute where attrelid = 'public.users'::regclass and attname = 'admin_usuarios' and not attisdropped) as coluna,
  has_column_privilege('authenticated', 'public.users', 'admin_usuarios', 'SELECT')                                       as tela_le_a_marca,
  not has_column_privilege('anon', 'public.users', 'admin_usuarios', 'SELECT')                                            as anon_nao_le,
  has_column_privilege('authenticated', 'public.users', 'okr_admin', 'SELECT')                                            as tela_le_admin_okr,
  not has_column_privilege('anon', 'public.users', 'okr_admin', 'SELECT')                                                 as anon_nao_le_admin_okr,
  not has_column_privilege('authenticated', 'public.users', 'salary', 'SELECT')                                           as salario_fechado,
  (select count(*) from pg_constraint where conname = 'users_admin_usuarios_so_comuns' and conrelid = 'public.users'::regclass) as check_so_comuns,
  (select prosrc like '%new.admin_usuarios := false;%' from pg_proc where oid = 'public.users_teste_molde()'::regprocedure)  as teste_sem_marca,
  (select count(*) from pg_trigger where tgname = 'users_senha_sorteada' and tgrelid = 'public.users'::regclass)          as gatilho_senha,
  (select count(*) from public.users where admin_usuarios)                                                                as com_a_marca,
  (select string_agg(username, ', ' order by username) from public.users where admin_usuarios)                           as quem;
