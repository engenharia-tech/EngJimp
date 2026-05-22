-- FIX ROLES AND PERMISSIONS
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Update User Roles Check Constraint
-- This ensures the 'PROCESSOS' role is accepted by the database
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR'));

-- 2. Configure Row Level Security (RLS) Permissively to enable client-side operations
-- Since we are using Custom Credentials and Custom Auth without Supabase native auth, RLS should be disabled or made fully permissive for all tables.
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.gantt_tasks DISABLE ROW LEVEL SECURITY;

-- 3. DROP old restrictive policies that were causing update failures
DROP POLICY IF EXISTS "Users can view all users" ON public.users;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can manage all users" ON public.users;
DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert their own activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Users can update their own activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Designers can update their interruptions" ON public.interruptions;
DROP POLICY IF EXISTS "Users can view all interruptions" ON public.interruptions;
DROP POLICY IF EXISTS "Users can insert interruptions" ON public.interruptions;

-- 4. Re-create permissive policies if you decide to keep RLS enabled:
-- CREATE POLICY "Permissive All users" ON public.users FOR ALL USING (true);
-- CREATE POLICY "Permissive All projects" ON public.projects FOR ALL USING (true);
-- CREATE POLICY "Permissive All interruptions" ON public.interruptions FOR ALL USING (true);
-- CREATE POLICY "Permissive All activities" ON public.operational_activities FOR ALL USING (true);

-- 6. Reload schema cache
NOTIFY pgrst, 'reload config';
