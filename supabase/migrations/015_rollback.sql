-- Rollback da 015 (alerta diário do uso do banco, 29/09/2026).
--
-- Tira SÓ o job 'infra-verificar' do pg_cron. NÃO apaga o segredo 'agenda_cron_secret' do
-- Vault (ele é da 013 e o disparador da agenda continua precisando dele) e não desliga
-- pg_cron / pg_net. A tabela infra_alerta (014) fica; o indicador na tela continua funcionando.

do $$
begin
  -- (dois IFs: a consulta em cron.job só pode ser montada se o pg_cron existir)
  if to_regclass('cron.job') is not null then
    if exists (select 1 from cron.job where jobname = 'infra-verificar') then
      perform cron.unschedule('infra-verificar');
    end if;
  end if;
end
$$;

-- Conferência: deve voltar vazia.
--   select jobname from cron.job where jobname = 'infra-verificar';
