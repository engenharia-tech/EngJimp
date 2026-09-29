-- Rollback da 014 (indicador de uso, 29/09/2026).
--
-- Tira a função de medição e a tabela dos alertas já mandados. Não mexe em nenhum dado do app.
-- Se a 015 (alerta diário) rodou, rode ANTES o 015_rollback.sql (tira o job do pg_cron).
-- Depois deste rollback, o chip do Edson fica cinza "BD ?" (a tela explica que a medição não
-- está instalada) — nada quebra.

drop table if exists public.infra_alerta;
drop function if exists public.infra_uso_banco();

notify pgrst, 'reload schema';

-- Conferência: as duas devem voltar vazias.
--   select to_regclass('public.infra_alerta');                 -- null
--   select to_regprocedure('public.infra_uso_banco()');        -- null
