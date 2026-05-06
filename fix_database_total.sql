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
-- Normalizar Tipos de Inovação
UPDATE public.innovations SET type = 'NEW_PROJECT' WHERE UPPER(type) IN ('NOVO PROJETO', 'NEW PROJECT', 'NEW_PROJECT', 'NOVO_PROJETO');
UPDATE public.innovations SET type = 'PRODUCT_IMPROVEMENT' WHERE UPPER(type) IN ('MELHORIA DE PRODUTO', 'PRODUCT IMPROVEMENT', 'PRODUCT_IMPROVEMENT', 'MELHORIA_DE_PRODUTO');
UPDATE public.innovations SET type = 'PROCESS_OPTIMIZATION' WHERE UPPER(type) IN ('OTIMIZAÇÃO DE PROCESSOS', 'PROCESS OPTIMIZATION', 'PROCESS_OPTIMIZATION', 'OTIMIZACAO_DE_PROCESSOS');

-- Qualquer tipo remanescente que não bata vira 'PRODUCT_IMPROVEMENT' para evitar erro fatal
UPDATE public.innovations 
SET type = 'PRODUCT_IMPROVEMENT' 
WHERE type NOT IN ('NEW_PROJECT', 'PRODUCT_IMPROVEMENT', 'PROCESS_OPTIMIZATION', 'NOVO PROJETO', 'MELHORIA DE PRODUTO', 'OTIMIZAÇÃO DE PROCESSOS');

-- Normalizar Métodos de Cálculo
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_calculation_type_check;
UPDATE public.innovations SET calculation_type = 'PER_UNIT' WHERE calculation_type IN ('POR UNIDADE PRODUZIDA', 'PER UNIT', 'PER_UNIT');
UPDATE public.innovations SET calculation_type = 'RECURRING_MONTHLY' WHERE calculation_type IN ('RECORRENTE (MENSUAL)', 'RECURRING MONTHLY', 'RECURRING_MONTHLY');
UPDATE public.innovations SET calculation_type = 'ONE_TIME' WHERE calculation_type IN ('VALOR ÚNICO / FIXO', 'ONE TIME', 'ONE_TIME');
UPDATE public.innovations SET calculation_type = 'ADD_EXPENSE' WHERE calculation_type IN ('ADICIONAR GASTO', 'ADD EXPENSE', 'ADD_EXPENSE');

-- 6. REATIVAR CONSTRAINTS DE INOVAÇÕES (Com suporte a múltiplos idiomas e chaves técnicas)
ALTER TABLE public.innovations ADD CONSTRAINT innovations_type_check 
CHECK (type IN ('NEW_PROJECT', 'PRODUCT_IMPROVEMENT', 'PROCESS_OPTIMIZATION', 'NOVO PROJETO', 'MELHORIA DE PRODUTO', 'OTIMIZAÇÃO DE PROCESSOS'));

ALTER TABLE public.innovations ADD CONSTRAINT innovations_calculation_type_check
CHECK (calculation_type IN ('PER_UNIT', 'RECURRING_MONTHLY', 'ONE_TIME', 'ADD_EXPENSE', 'POR UNIDADE PRODUZIDA', 'RECORRENTE (MENSUAL)', 'VALOR ÚNICO / FIXO', 'ADICIONAR GASTO'));

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

-- 8. Tabela de Logs de Auditoria (Audit Log)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid,
  user_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  timestamp timestamptz DEFAULT now(),
  details text
);

-- Habilitar RLS para Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive Audit Select" ON public.audit_logs;
CREATE POLICY "Permissive Audit Select" ON public.audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permissive Audit Insert" ON public.audit_logs;
CREATE POLICY "Permissive Audit Insert" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- 9. Corrigir RLS Geral
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all users" ON public.users;
CREATE POLICY "Users can view all users" ON public.users FOR SELECT USING (true);

-- 8. Tabela de Logs de Auditoria (Audit Log)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid,
  user_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_name text,
  timestamp timestamptz DEFAULT now(),
  details text
);

-- Habilitar RLS para Audit Logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive Audit Select" ON public.audit_logs;
CREATE POLICY "Permissive Audit Select" ON public.audit_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permissive Audit Insert" ON public.audit_logs;
CREATE POLICY "Permissive Audit Insert" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- 9. Recarregar Cache do PostgREST
NOTIFY pgrst, 'reload config';
