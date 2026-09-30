-- =====================================================================================================
-- 020 — Rogerio Sinotti (projetista) PERDE O ACESSO, sem ser excluído — rodar na SEXTA 02/10/2026,
--        depois do expediente (30/09/2026)
--
-- Decisão do Edson, 30/09: "o projetista Rogerio será desligado na sexta feira … preciso que as
-- informações criadas por ele continuem registradas" → "Desligar, sem excluir".
-- ⚠ É o login 'Rogerio' (Rogerio Sinotti, PROJETISTA). NÃO é o 'rogerio.p' (Rogerio, Suprimentos), que fica.
--
-- Antes: ele entra com a senha dele, ou pede um código por e-mail e cria outra.
-- Agora: a senha vira um valor aleatório que ninguém conhece (no hash e no texto), o e-mail sai do
--   cadastro (sem ele, o "código por e-mail" não chega a lugar nenhum — senão ele recriaria a senha) e
--   os códigos pendentes são apagados. O CADASTRO FICA: projetos, horas, paradas, inovações, agenda e
--   OKR continuam no nome dele. NÃO exclui e NÃO mexe no salário (tirar do custo é outra etapa, por data).
-- Limite conhecido: um crachá já emitido vale até 24 h — por isso rodar no fim do expediente de sexta.
-- Trava: só grava se achar EXATAMENTE 1 pessoa (login rogerio, cargo PROJETISTA, não o Edson). Outro
--   número = erro e NADA é gravado.
-- Desfazer: o Edson dá uma senha nova a ele pela tela de Equipe e devolve o e-mail no cadastro.
-- =====================================================================================================

set search_path = public, extensions;   -- o crypt()/gen_salt() do Supabase mora em "extensions"

do $$
declare
  n int;
  email_aceita_nulo boolean;
begin
  select is_nullable = 'YES' into email_aceita_nulo
    from information_schema.columns
   where table_schema = 'public' and table_name = 'users' and column_name = 'email';

  update public.users
     set password_hash      = crypt(gen_random_uuid()::text || clock_timestamp()::text, gen_salt('bf')),
         password           = gen_random_uuid()::text,
         must_set_password  = false,
         reset_code_hash    = null,
         reset_code_expires = null,
         email              = case when coalesce(email_aceita_nulo, true) then null
                                   else 'desligado-' || id::text || '@desligado.invalid' end
   where lower(trim(username)) = 'rogerio'
     and role = 'PROJETISTA'
     and id <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Rogerio 020: esperava 1 usuário (login rogerio, PROJETISTA), achei %. Nada foi gravado.', n;
  end if;
end
$$;

-- Conferência (só lê). Esperado: 1 linha — Rogerio · Rogerio Sinotti · PROJETISTA · email_no_cadastro
-- false · senha_trocada true · codigo_pendente false. E o 'rogerio.p' não aparece aqui (não foi tocado).
select username,
       trim(coalesce(name, '') || ' ' || coalesce(surname, '')) as nome,
       role as cargo,
       (email is not null and email not like '%@desligado.invalid') as email_no_cadastro,
       (password_hash like '$2%') as senha_trocada,
       (reset_code_hash is not null) as codigo_pendente
  from public.users
 where lower(trim(username)) = 'rogerio';
