-- =====================================================================
-- 006 — Rate limiting (anti brute-force) — item ALTO da auditoria (A1/A2/A3)
-- =====================================================================
-- O Vercel e serverless: NAO guarda contador em memoria entre as invocacoes.
-- Entao a contagem de tentativas fica no BANCO. So o servidor (service_role)
-- chama estas funcoes; o navegador nunca as ve.
--
-- Protege: /api/auth/login (forca-bruta de senha), /api/auth/set-password
-- (forca-bruta do codigo de 6 digitos), /api/auth/request-code (lockout/spam
-- direcionado) e /api/gemini/generate (abuso de cota).
--
-- Seguro rodar a qualquer momento: o codigo do servidor ja publicado chama
-- estas funcoes com fail-open (se a funcao ainda nao existe, ele deixa passar).
-- Depois desta migracao, a trava passa a valer de fato.
-- =====================================================================

create table if not exists public.rate_limit_hits (
  id bigint generated always as identity primary key,
  bucket text not null,
  at timestamptz not null default now()
);
create index if not exists idx_rate_limit_bucket_at on public.rate_limit_hits (bucket, at);

-- Ninguem loga acessa esta tabela direto: RLS ligada e SEM policy. As funcoes
-- SECURITY DEFINER (dono = postgres) ignoram a RLS.
alter table public.rate_limit_hits enable row level security;

-- Registra uma tentativa e devolve quantas houve na janela (segundos).
create or replace function public.rate_limit_hit(p_bucket text, p_window_seconds int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  -- housekeeping barato: apaga o que ja saiu de qualquer janela util deste bucket
  delete from public.rate_limit_hits
    where bucket = p_bucket and at < now() - make_interval(secs => greatest(p_window_seconds * 2, 60));
  insert into public.rate_limit_hits(bucket) values (p_bucket);
  select count(*) into v from public.rate_limit_hits
    where bucket = p_bucket and at > now() - make_interval(secs => p_window_seconds);
  return v;
end $$;

-- So conta (nao registra) — usado para "peek" antes de agir.
create or replace function public.rate_limit_count(p_bucket text, p_window_seconds int)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  select count(*) into v from public.rate_limit_hits
    where bucket = p_bucket and at > now() - make_interval(secs => p_window_seconds);
  return v;
end $$;

-- Limpa um bucket (login/set-password com SUCESSO zera as falhas do usuario).
create or replace function public.rate_limit_reset(p_bucket text)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.rate_limit_hits where bucket = p_bucket;
end $$;

-- So o servidor (service_role) executa. Tira o EXECUTE default de todo mundo.
revoke all on function public.rate_limit_hit(text, int)   from public, anon, authenticated;
revoke all on function public.rate_limit_count(text, int) from public, anon, authenticated;
revoke all on function public.rate_limit_reset(text)      from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int)   to service_role;
grant execute on function public.rate_limit_count(text, int) to service_role;
grant execute on function public.rate_limit_reset(text)      to service_role;

notify pgrst, 'reload config';
