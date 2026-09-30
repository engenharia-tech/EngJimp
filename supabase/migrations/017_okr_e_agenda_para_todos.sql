-- =====================================================================================================
-- 017 — OKR e AGENDA para TODOS os usuários (30/09/2026)
--
-- Pedido do Paulo e do Julio: "peço que o Edson libere o acesso a todos para lançamento … linkar
-- cada OKR ao nosso planejamento, tudo dentro da mesma ferramenta". Decisão do Edson, 30/09:
-- "libere okr e agenda para todos".
--
-- Antes: só quem tinha a marca users.okr_enabled (ou "somente OKR" / admin de OKR) tinha a aba
--   "Meu OKR" e a Agenda.
-- Agora: todo usuário cadastrado ganha okr_enabled = true → "Meu OKR" (o seu) e a Agenda (a sua).
--   Quem for criado daqui para frente já nasce com a marca (tela de Usuários, commit de 30/09).
-- Fica de fora, de propósito:
--   · o Edson — a linha dele não é tocada (o OKR e a agenda dele já valem pelo id);
--   · o visualizador (okr_viewer ou cargo ADM_EXTERNO, ex.: Patrícia): só lê, não lança (25/09);
--   · usuário de teste zz_* (não deveria existir; se existir, não ganha nada).
-- NÃO muda: quem vê o OKR dos outros (Edson e admin de OKR editam; o CEO lê) e quem vê a agenda
--   dos outros (SÓ o Edson — 29/09). Não mexe em cargo, senha, e-mail, "somente OKR", admin nem
--   visualizador. Nenhuma tabela, função ou política muda: é uma marca por usuário.
-- Quem estava com o app aberto: F5 (ou sair e entrar) para as abas aparecerem.
--
-- O resultado é a lista de TODOS os usuários: quem ganhou agora, quem já tinha, quem ficou de fora,
-- e se o e-mail cadastrado recebe os alertas da agenda (a regra de 29/09: domínio da empresa, ou o
-- Edson). "confira" = e-mail de fora: só recebe se o endereço estiver em Configurações.
--
-- Desfazer (só os que ESTE arquivo ligou — os logins marcados "1. LIBERADO AGORA" no resultado):
--   update public.users set okr_enabled = false where username in ('login1', 'login2', ...);
-- =====================================================================================================

with liberados as (
  update public.users u
     set okr_enabled = true
   where not coalesce(u.okr_enabled, false)
     and u.id <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid
     and not coalesce(u.okr_viewer, false)
     and coalesce(u.role, '') <> 'ADM_EXTERNO'
     and lower(coalesce(u.username, '')) not like 'zz\_%'
  returning u.id
)
select u.username as login,
       trim(coalesce(u.name, '') || ' ' || coalesce(u.surname, '')) as nome,
       u.role as cargo,
       case
         when l.id is not null then '1. LIBERADO AGORA'
         when u.id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid then '4. Edson (dono)'
         when coalesce(u.okr_viewer, false) or coalesce(u.role, '') = 'ADM_EXTERNO'
           then '3. visualizador (só lê, sem agenda)'
         when lower(coalesce(u.username, '')) like 'zz\_%' then '5. teste (fica de fora)'
         else '2. já tinha'
       end as okr_e_agenda,
       case
         when u.id = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid then 'sim'
         when lower(split_part(trim(coalesce(u.email, '')), '@', 2))
              in ('jimp.com.br', 'joinvilleimplementos.com.br', 'furgoesjoinville.com.br') then 'sim'
         when trim(coalesce(u.email, '')) = '' then 'NÃO — sem e-mail'
         else 'confira — e-mail de fora'
       end as recebe_alerta_da_agenda
  from public.users u
  left join liberados l on l.id = u.id
 order by 4, 2;
