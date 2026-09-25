-- 010 — A auditoria só aceita o PRÓPRIO usuário (25/09/2026).
--
-- Antes: audit_insert era WITH CHECK (auth.uid() IS NOT NULL) — qualquer logado
-- gravava auditoria com o user_id de outra pessoa, e com o nome, a data e a hora
-- que quisesse (a tela de Auditoria mostra o NOME, não o id).
--
-- Agora:
--   1. user_id tem de ser o do crachá (auth.uid()); nulo também é recusado.
--   2. Um gatilho carimba o que o navegador não pode escolher: a hora é a do banco,
--      e o nome é o do cadastro (aceita o nome curto, o nome completo ou o rótulo
--      "Sistema Nexus" que o ajuste automático usa — qualquer outro vira o nome
--      completo do cadastro).
--   O servidor (service_role, sem auth.uid()) não passa pelo carimbo.
--
-- O ajuste automático de atividade esquecida (App.tsx) gravava com o user_id do DONO
-- da atividade; agora grava com o de quem está logado, e o dono vai no texto.

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs
  for insert to authenticated
  with check (user_id = auth.uid());

create or replace function public.audit_logs_carimba_quem()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_curto text;
  v_cheio text;
begin
  if v_uid is null then
    return new;  -- servidor (service_role): confia no que ele manda
  end if;
  new."timestamp" := now();
  select btrim(coalesce(u.name, '')),
         btrim(coalesce(u.name, '') || ' ' || coalesce(u.surname, ''))
    into v_curto, v_cheio
    from public.users u
   where u.id = v_uid;
  if new.user_name is distinct from v_curto
     and new.user_name is distinct from v_cheio
     and new.user_name is distinct from 'Sistema Nexus' then
    new.user_name := coalesce(nullif(v_cheio, ''), nullif(v_curto, ''), 'Usuário');
  end if;
  return new;
end
$$;

revoke all on function public.audit_logs_carimba_quem() from public, anon, authenticated;

drop trigger if exists audit_logs_carimba_quem on public.audit_logs;
create trigger audit_logs_carimba_quem
  before insert on public.audit_logs
  for each row execute function public.audit_logs_carimba_quem();
