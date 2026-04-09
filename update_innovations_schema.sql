-- Adiciona as colunas de produtividade na tabela de inovações
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS productivity_before numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS productivity_after numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS unit_product_cost numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS unit_product_value numeric DEFAULT 0;

-- Recarrega o cache do PostgREST para reconhecer as novas colunas
NOTIFY pgrst, 'reload config';
