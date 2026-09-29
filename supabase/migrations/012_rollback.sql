-- Rollback da 012 (agenda). APAGA os compromissos e a fila de alertas.
-- Antes, se quiser guardar: select * from public.agenda_item; select * from public.agenda_alerta;
-- Se a 013 (disparador) foi rodada, rode ANTES o 013_rollback.sql INTEIRO (tira os 2 jobs do
-- pg_cron — 'agenda-disparar' e 'agenda-limpar-historico' — e o segredo do Vault). Só o
-- cron.unschedule('agenda-disparar') deixava para trás o job de faxina e o segredo.

drop table if exists public.agenda_alerta;
drop table if exists public.agenda_item;

drop function if exists public.agenda_pegar_devidos(int);
drop function if exists public.agenda_marcar_envio(bigint, boolean, text, text, uuid[]);  -- a de hoje (p_recebeu, cético 2)
drop function if exists public.agenda_marcar_envio(bigint, boolean, text, text);          -- a de antes (4 argumentos); inofensivo
drop function if exists public.agenda_item_antes();
drop function if exists public.agenda_item_depois();
drop function if exists public.agenda_momento_alerta(text, date, time);
drop function if exists public.agenda_prazo_lembrete(date, time);
drop function if exists public.agenda_pode_usar();
drop function if exists public.agenda_e_edson();
drop function if exists public.agenda_e_master();  -- nome de um rascunho de 29/09 (nunca aplicado); inofensivo
drop function if exists public.agenda_eu_cadastrado();

notify pgrst, 'reload schema';
