-- FIX ROLES AND PERMISSIONS
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Update User Roles Check Constraint
-- This ensures the 'PROCESSOS' role is accepted by the database
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR'));

-- 2. Ensure RLS is enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 3. Fix RLS Policies for Users
-- These policies use session variables (app.user_id, app.user_role) 
-- which must be set by the application after a custom login.
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;

CREATE POLICY "Users can view all users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (id::text = current_setting('app.user_id', true));
CREATE POLICY "Admins can manage all users" ON public.users FOR ALL USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- 4. Fix RLS Policies for Projects (Ensure GESTOR can delete)
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- 5. Fix RLS Policies for Operational Activities
DROP POLICY IF EXISTS "Users can insert their own activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON public.operational_activities;

CREATE POLICY "Users can insert their own activities" ON public.operational_activities FOR INSERT WITH CHECK (user_id::text = current_setting('app.user_id', true));
CREATE POLICY "Users can update their own activities" ON public.operational_activities FOR UPDATE USING (user_id::text = current_setting('app.user_id', true));

-- 6. Reload schema cache
NOTIFY pgrst, 'reload config';
