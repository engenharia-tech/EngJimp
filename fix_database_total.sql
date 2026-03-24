-- CORREÇÃO TOTAL DO BANCO DE DADOS
-- Execute este script no SQL Editor do seu Supabase (https://supabase.com/dashboard/project/_/sql)

-- 1. Atualizar Cargos Permitidos (Adiciona 'PROCESSOS')
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
CHECK (role IN ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR'));

-- 2. Garantir que as colunas necessárias existem na tabela de projetos
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_code text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS flooring_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS implement_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS estimated_seconds integer;

-- 3. Corrigir Permissões de Exclusão (RLS)
-- Permite que GESTOR e CEO excluam projetos
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
CREATE POLICY "Admins can delete projects" ON public.projects 
FOR DELETE USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- 4. Corrigir Permissões de Usuários
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;

CREATE POLICY "Users can view all users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Admins can manage all users" ON public.users FOR ALL USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- 5. Recarregar Cache do PostgREST
NOTIFY pgrst, 'reload config';
