-- 011 — A leitura da auditoria lê o cargo do CADASTRO pelo id (25/09/2026).
--
-- Antes: audit_select usava (auth.jwt() ->> 'app_role') IN ('GESTOR','CEO','COORDENADOR').
-- O app_role é gravado no crachá no login e o crachá dura 24 h — então um admin REBAIXADO
-- continuava lendo a auditoria de todos até o token vencer. (O claim não é forjável sem o
-- SUPABASE_JWT_SECRET, mas a leitura ficava presa ao que era verdade no login.)
--
-- Agora: pode_ler_auditoria() lê o cargo de public.users por auth.uid() — revogar o cargo
-- vale na hora. Mesmo padrão de is_edson() / okr_is_ceo() / usuario_cadastrado().
-- SECURITY DEFINER e SEM revoke de EXECUTE do authenticated: a função é avaliada no contexto
-- de quem consulta dentro da política, então authenticated precisa poder executá-la (ela só
-- devolve um booleano sobre o próprio usuário).
--
-- As políticas RESTRICTIVE somente_okr_sel (NOT okr_is_viewer) e so_cadastrado continuam
-- valendo por cima desta.

create or replace function public.pode_ler_auditoria()
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $f$
  select coalesce(auth.uid() = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid, false)
      or exists (select 1 from public.users where id = auth.uid() and role = any (array['GESTOR','CEO','COORDENADOR']))
$f$;

drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs
  for select to authenticated
  using (public.pode_ler_auditoria());
