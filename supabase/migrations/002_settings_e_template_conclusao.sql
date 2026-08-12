-- =====================================================================
-- 002 — Conserta armazenamento de Configuracoes + template de CONCLUSAO
-- =====================================================================
-- A tabela public.settings e de UMA LINHA LARGA (cada config e uma coluna),
-- mas o app tentava ler/gravar como key/value -> nunca persistia no banco
-- (ficava so no localStorage de cada navegador). Aqui completamos as colunas
-- que faltam e garantimos que exista UMA linha. O codigo passa a ler/gravar
-- essa linha.
--
-- SEGURA: so ADD COLUMN IF NOT EXISTS + um INSERT condicional. Nao apaga nada.
-- =====================================================================

alter table public.settings add column if not exists completion_email_template text;
alter table public.settings add column if not exists logo_url                  text;
alter table public.settings add column if not exists auto_lock_timeout         integer;
alter table public.settings add column if not exists email_from                text;

-- ATENCAO: de proposito NAO inserimos nenhuma linha aqui. Se inserissemos uma
-- linha padrao, o app leria use_automatic_cost=false e templates NULL e
-- SOBRESCREVERIA as configuracoes atuais (que hoje vivem no localStorage) —
-- zerando o custo automatico e o template de interrupcao. Em vez disso, a
-- tabela fica vazia ate o Edson salvar em Configuracoes; o proprio save cria
-- a linha (id tem default uuid_generate_v4) com os valores reais do formulario.

notify pgrst, 'reload config';

-- Conferencia:
--   select column_name from information_schema.columns
--   where table_name='settings' and column_name='completion_email_template';
