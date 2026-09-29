-- Rollback da 016 (livre/ocupado da agenda, 29/09/2026).
--
-- Tira só a função agenda_ocupado. Não mexe em nenhum compromisso, alerta, política ou função
-- da 012. Depois dele a tela deixa de mostrar "ocupado" ao convidar: o PostgREST responde 404
-- PGRST202 e a tela tem de tratar isso como "sem informação" (nunca travar o salvar).
-- Se for desfazer a agenda inteira: este ANTES do 012_rollback.sql (o da 012 não conhece esta função).

drop function if exists public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid);

notify pgrst, 'reload schema';

-- Conferência: deve voltar null.
--   select to_regprocedure('public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid)');
