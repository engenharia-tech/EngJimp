-- =====================================================================
-- ETAPA 1 — Base de autenticacao com hash + codigo de ativacao
-- =====================================================================
-- SEGURA E ADITIVA: nao altera nada do login atual. So adiciona colunas e
-- funcoes que ainda NAO sao usadas pelo app. Pode rodar em producao a
-- qualquer hora. Se algo falhar, nada quebra (nada depende disto ainda).
--
-- Modelo (mesmo do APPCUSTOS): o usuario recebe um CODIGO de uso unico,
-- por e-mail (naoresponda@) ou entregue pelo admin, e com ele CRIA a
-- propria senha. A senha e guardada com HASH (bcrypt via pgcrypto); o
-- texto puro so sera apagado na etapa final, apos todos migrarem.
--
-- IMPORTANTE: estas funcoes sao SECURITY DEFINER e serao chamadas APENAS
-- pelo servidor /api (chave de servico). O EXECUTE e revogado do papel
-- anonimo — o navegador nunca chama isto direto. Login e reset passam a
-- ser mediados pelo servidor nas proximas etapas.
-- =====================================================================

-- pgcrypto ja consta como instalado no diagnostico; garantimos mesmo assim.
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Colunas novas (idempotentes)
-- ---------------------------------------------------------------------
alter table public.users add column if not exists password_hash       text;
alter table public.users add column if not exists must_set_password   boolean not null default false;
alter table public.users add column if not exists reset_code_hash     text;
alter table public.users add column if not exists reset_code_expires  timestamptz;


-- ---------------------------------------------------------------------
-- request_password_code(username, horas)
--   Gera um codigo de 6 digitos, guarda o HASH do codigo + validade e
--   marca o usuario como "precisa criar senha". Retorna o codigo em claro
--   para o servidor enviar por e-mail ou mostrar ao admin.
--   Nao revela se o usuario existe (retorna NULL silenciosamente).
-- ---------------------------------------------------------------------
create or replace function public.request_password_code(p_username text, p_hours int default 24)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_found int;
begin
  select 1 into v_found from public.users where lower(username) = lower(p_username) limit 1;
  if v_found is null then
    return null;
  end if;

  v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');

  update public.users
     set reset_code_hash    = crypt(v_code, gen_salt('bf')),
         reset_code_expires = now() + make_interval(hours => greatest(1, p_hours)),
         must_set_password  = true
   where lower(username) = lower(p_username);

  return v_code;
end;
$$;


-- ---------------------------------------------------------------------
-- set_password_with_code(username, code, new_password)
--   Valida o codigo (hash + validade), grava a senha nova com HASH,
--   APAGA o texto puro daquele usuario, limpa o codigo e desmarca o
--   "precisa criar senha". Retorna true/false.
-- ---------------------------------------------------------------------
create or replace function public.set_password_with_code(
  p_username text, p_code text, p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash text;
  v_exp  timestamptz;
begin
  select reset_code_hash, reset_code_expires
    into v_hash, v_exp
    from public.users
   where lower(username) = lower(p_username);

  if v_hash is null or v_exp is null or now() > v_exp then
    return false;                                   -- sem codigo valido / expirado
  end if;
  if crypt(p_code, v_hash) <> v_hash then
    return false;                                   -- codigo incorreto
  end if;
  if length(coalesce(p_new_password, '')) < 6 then
    return false;                                   -- senha muito curta
  end if;

  update public.users
     set password_hash      = crypt(p_new_password, gen_salt('bf')),
         password            = '',                  -- apaga o texto puro deste usuario
         must_set_password   = false,
         reset_code_hash     = null,
         reset_code_expires  = null
   where lower(username) = lower(p_username);

  return true;
end;
$$;


-- ---------------------------------------------------------------------
-- verify_login(username, password)
--   Novo caminho de login. Valida por HASH; durante a transicao aceita
--   tambem a senha antiga em texto puro (para quem ainda nao migrou).
--   Retorna os dados do usuario SEM expor senha nem hash.
-- ---------------------------------------------------------------------
create or replace function public.verify_login(p_username text, p_password text)
returns table (
  id uuid, username text, name text, surname text, email text,
  phone text, role text, salary numeric, must_set_password boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select u.id, u.username, u.name, u.surname, u.email,
         u.phone, u.role, u.salary, u.must_set_password
    from public.users u
   where lower(u.username) = lower(p_username)
     and (
           (u.password_hash is not null and u.password_hash = crypt(p_password, u.password_hash))
        or (coalesce(u.password_hash, '') = '' and coalesce(u.password, '') <> '' and u.password = p_password)
     )
   limit 1;
end;
$$;


-- ---------------------------------------------------------------------
-- Permissoes: estas funcoes sao do SERVIDOR (/api), nunca do navegador.
-- Revogamos o EXECUTE do papel anonimo/autenticado e liberamos so para o
-- papel de servico. Assim, ninguem gera codigo nem loga direto pela chave
-- publica — tudo passa pelo servidor nas proximas etapas.
-- ---------------------------------------------------------------------
revoke execute on function public.request_password_code(text, int)          from public, anon, authenticated;
revoke execute on function public.set_password_with_code(text, text, text)   from public, anon, authenticated;
revoke execute on function public.verify_login(text, text)                   from public, anon, authenticated;

grant execute on function public.request_password_code(text, int)        to service_role;
grant execute on function public.set_password_with_code(text, text, text) to service_role;
grant execute on function public.verify_login(text, text)                to service_role;

-- Recarrega o cache do PostgREST
notify pgrst, 'reload config';

-- =====================================================================
-- Conferencia rapida (opcional) — deve listar as 3 funcoes e as colunas:
--   select proname from pg_proc where proname in
--     ('request_password_code','set_password_with_code','verify_login');
--   select column_name from information_schema.columns
--     where table_name='users' and column_name in
--     ('password_hash','must_set_password','reset_code_hash','reset_code_expires');
-- =====================================================================
