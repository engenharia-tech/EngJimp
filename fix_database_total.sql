-- CORREÇÃO TOTAL DO BANCO DE DADOS (VERSÃO COMPLETA 2026)
-- Execute este script no SQL Editor do seu Supabase (https://supabase.com/dashboard/project/_/sql)

-- 1. DROPS PREVENTIVOS (Evita erro ao normalizar dados)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_type_check;

-- 2. Atualizar Cargos Permitidos
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
CHECK (role IN ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR'));

-- 3. Garantir colunas na tabela de projetos
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_code text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS flooring_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS implement_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS estimated_seconds integer;

-- 4. Tabela de Inovações (Garantir colunas novas)
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS productivity_before numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS productivity_after numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS unit_product_cost numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS unit_product_value numeric DEFAULT 0;

-- 5. NORMALIZAÇÃO DE DADOS (Limpa antes de travar a porta novamente)
UPDATE public.innovations SET type = 'NOVO PROJETO' WHERE UPPER(type) IN ('NEW PROJECT', 'NEW_PROJECT', 'NOVO_PROJETO');
UPDATE public.innovations SET type = 'MELHORIA DE PRODUTO' WHERE UPPER(type) IN ('PRODUCT IMPROVEMENT', 'PRODUCT_IMPROVEMENT', 'MELHORIA_DE_PRODUTO');
UPDATE public.innovations SET type = 'OTIMIZAÇÃO DE PROCESSOS' WHERE UPPER(type) IN ('PROCESS OPTIMIZATION', 'PROCESS_OPTIMIZATION', 'OTIMIZACAO_DE_PROCESSOS');

-- Qualquer tipo remanescente que não bata vira 'MELHORIA DE PRODUTO' para evitar erro fatal
UPDATE public.innovations 
SET type = 'MELHORIA DE PRODUTO' 
WHERE type NOT IN ('NOVO PROJETO', 'MELHORIA DE PRODUTO', 'OTIMIZAÇÃO DE PROCESSOS', 'NEW_PROJECT', 'PRODUCT_IMPROVEMENT', 'PROCESS_OPTIMIZATION');

-- 6. REATIVAR CONSTRAINT DE INOVAÇÕES (Com suporte a múltiplos idiomas)
ALTER TABLE public.innovations ADD CONSTRAINT innovations_type_check 
CHECK (type IN ('NOVO PROJETO', 'MELHORIA DE PRODUTO', 'OTIMIZAÇÃO DE PROCESSOS', 'NEW_PROJECT', 'PRODUCT_IMPROVEMENT', 'PROCESS_OPTIMIZATION'));

-- 7. Tabela de Gantt (Project Nexus)
CREATE TABLE IF NOT EXISTS public.gantt_tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.gantt_tasks(id) ON DELETE CASCADE,
  start_date text NOT NULL,
  end_date text NOT NULL,
  color text,
  is_milestone boolean DEFAULT false,
  assigned_to jsonb DEFAULT '[]'::jsonb,
  progress integer DEFAULT 0,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  workload jsonb DEFAULT '{}'::jsonb,
  reports text,
  "order" integer DEFAULT 0,
  status text DEFAULT 'todo',
  priority text DEFAULT 'medium',
  category text,
  dependencies jsonb DEFAULT '[]'::jsonb,
  tenant_id uuid
);

-- Habilitar RLS para Gantt
ALTER TABLE public.gantt_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive Gantt Select" ON public.gantt_tasks;
CREATE POLICY "Permissive Gantt Select" ON public.gantt_tasks FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permissive Gantt All" ON public.gantt_tasks;
CREATE POLICY "Permissive Gantt All" ON public.gantt_tasks FOR ALL USING (true);

-- 8. Corrigir RLS Geral
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all users" ON public.users;
CREATE POLICY "Users can view all users" ON public.users FOR SELECT USING (true);

-- 9. Recarregar Cache do PostgREST
NOTIFY pgrst, 'reload config';
