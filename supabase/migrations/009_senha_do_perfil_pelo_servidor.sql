-- 009 — A senha do PRÓPRIO usuário passa a ser conferida e trocada no banco (25/09/2026).
--
-- Antes: o "Meu Perfil" comparava a "senha atual" digitada com `user.password` NO
-- NAVEGADOR — e desde o login pelo servidor (Etapa 3) esse campo chega vazio. O botão
-- nunca salvava nada, e a senha nova iria em texto para /api/users/save. A tela de
-- bloqueio por inatividade tinha a mesma comparação: ninguém destrava pela senha
-- desde 01/06/2026 (últimos 42 desbloqueios na auditoria).
--
-- Agora o servidor (/api/auth/change-password e /api/auth/confirm-password) chama
-- estas duas funções com o id do CRACHÁ. A regra é a mesma do verify_login: com hash,
-- só o hash vale; sem hash, o texto puro da transição. A senha nova sai com hash e
-- o texto puro é apagado. Só service_role executa (ninguém testa senha pela chave
-- pública, por fora do limite de tentativas do servidor).

create or replace function public.kpi_senha_confere(p_user uuid, p_senha text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
      from public.users u
     where u.id = p_user
       and coalesce(p_senha, '') <> ''
       and (
         (coalesce(u.password_hash, '') <> '' and u.password_hash = crypt(p_senha, u.password_hash))
         or (coalesce(u.password_hash, '') = '' and coalesce(u.password, '') <> '' and u.password = p_senha)
       )
  );
$$;

-- Devolve 'OK', 'ATUAL_ERRADA', 'CURTA' ou 'SUMIU' (o servidor traduz para a tela).
create or replace function public.kpi_trocar_propria_senha(p_user uuid, p_atual text, p_nova text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_hash  text;
  v_plain text;
begin
  if length(coalesce(p_nova, '')) < 6 then
    return 'CURTA';
  end if;

  select password_hash, password into v_hash, v_plain
    from public.users
   where id = p_user
   for update;
  if not found then
    return 'SUMIU';
  end if;

  if coalesce(p_atual, '') = '' then
    return 'ATUAL_ERRADA';
  end if;
  if coalesce(v_hash, '') <> '' then
    if v_hash <> crypt(p_atual, v_hash) then
      return 'ATUAL_ERRADA';
    end if;
  elsif coalesce(v_plain, '') = '' or v_plain <> p_atual then
    return 'ATUAL_ERRADA';
  end if;

  -- Quem provou a senha atual encerra também um pedido de código pendente.
  update public.users
     set password_hash      = crypt(p_nova, gen_salt('bf')),
         password           = '',
         must_set_password  = false,
         reset_code_hash    = null,
         reset_code_expires = null
   where id = p_user;
  return 'OK';
end;
$$;

revoke all on function public.kpi_senha_confere(uuid, text) from public, anon, authenticated;
revoke all on function public.kpi_trocar_propria_senha(uuid, text, text) from public, anon, authenticated;
grant execute on function public.kpi_senha_confere(uuid, text) to service_role;
grant execute on function public.kpi_trocar_propria_senha(uuid, text, text) to service_role;

-- RPC nova só aparece na API com 'reload schema' (não 'reload config').
notify pgrst, 'reload schema';
