-- Rollback da 013 (disparador da agenda, 29/09/2026).
--
-- Para o disparador: tira os jobs 'agenda-disparar' e 'agenda-limpar-historico' do pg_cron
-- e apaga o segredo 'agenda_cron_secret' do Vault. A fila (agenda_alerta) e os compromissos
-- ficam intactos — os alertas só param de sair ("agendado" até alguém religar a 013).
-- NÃO desliga pg_cron / pg_net (outra coisa pode usar); para desligar: Database → Extensions.
-- Na Vercel, a variável AGENDA_CRON_SECRET pode ficar ou sair (sem ela a rota responde 503).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'agenda-disparar') then
      perform cron.unschedule('agenda-disparar');
    end if;
    if exists (select 1 from cron.job where jobname = 'agenda-limpar-historico') then
      perform cron.unschedule('agenda-limpar-historico');
    end if;
  end if;
end
$$;

delete from vault.secrets where name = 'agenda_cron_secret';

-- Conferência: as duas consultas devem voltar vazias.
--   select jobname from cron.job where jobname like 'agenda-%';
--   select name from vault.secrets where name = 'agenda_cron_secret';
