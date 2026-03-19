-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users Table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  password text not null,
  name text not null,
  surname text,
  email text,
  phone text,
  role text not null check (role in ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR')),
  salary numeric default 0,
  tenant_id uuid,
  created_at timestamptz default now()
);

-- Settings Table
create table if not exists public.settings (
  key text primary key,
  value text,
  tenant_id uuid,
  created_at timestamptz default now()
);

-- Projects Table
create table if not exists public.projects (
  id uuid primary key default uuid_generate_v4(),
  ns text not null,
  client_name text,
  flooring_type text,
  project_code text,
  type text not null,
  implement_type text,
  start_time timestamptz not null,
  end_time timestamptz,
  total_active_seconds integer default 0,
  interruption_seconds integer default 0,
  total_seconds integer default 0,
  productive_cost numeric default 0,
  interruption_cost numeric default 0,
  total_cost numeric default 0,
  estimated_seconds integer,
  pauses jsonb default '[]'::jsonb,
  variations jsonb default '[]'::jsonb,
  status text not null,
  notes text,
  is_overtime boolean default false,
  user_id uuid references public.users(id),
  tenant_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Issues Table
create table if not exists public.issues (
  id uuid primary key default uuid_generate_v4(),
  project_ns text not null,
  project_id uuid references public.projects(id),
  type text not null,
  description text not null,
  date text not null,
  reported_by text,
  tenant_id uuid,
  created_at timestamptz default now()
);

-- Innovations Table
create table if not exists public.innovations (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text not null,
  type text not null,
  calculation_type text,
  unit_savings numeric default 0,
  quantity numeric default 0,
  total_annual_savings numeric default 0,
  investment_cost numeric default 0,
  status text not null,
  author_id uuid references public.users(id),
  materials jsonb default '[]'::jsonb,
  machine jsonb default '{}'::jsonb,
  tenant_id uuid,
  created_at timestamptz default now()
);

-- Interruption Types Table
create table if not exists public.interruption_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_active boolean default true,
  tenant_id uuid,
  created_at timestamptz default now()
);

-- Interruptions Table
create table if not exists public.interruptions (
  id uuid primary key default uuid_generate_v4(),
  project_id uuid references public.projects(id),
  project_ns text,
  client_name text,
  designer_id uuid references public.users(id),
  start_time timestamptz not null,
  end_time timestamptz,
  problem_type text,
  responsible_area text,
  responsible_person text,
  description text,
  status text,
  total_time_seconds integer default 0,
  tenant_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Activity Types Table
create table if not exists public.activity_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_active boolean default true,
  tenant_id uuid,
  created_at timestamptz default now()
);

-- Operational Activities Table
create table if not exists public.operational_activities (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id),
  activity_type_id uuid references public.activity_types(id),
  activity_name text not null,
  start_time timestamptz not null,
  end_time timestamptz,
  duration_seconds integer default 0,
  notes text,
  project_id uuid references public.projects(id),
  is_flagged boolean default false,
  tenant_id uuid,
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.settings enable row level security;
alter table public.projects enable row level security;
alter table public.issues enable row level security;
alter table public.innovations enable row level security;
alter table public.interruption_types enable row level security;
alter table public.interruptions enable row level security;
alter table public.activity_types enable row level security;
alter table public.operational_activities enable row level security;

-- Tenant Helper Function
-- NOTE: This function depends on auth.uid(), which is only available if using Supabase Auth.
-- Since the app uses a custom login, this will return NULL unless the user is also logged into Supabase Auth.
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT tenant_id FROM public.users WHERE id = auth.uid() $$;

-- RLS Policies
-- IMPORTANT: These policies use session variables (app.user_id, app.user_role) 
-- which must be set by the application after a custom login.

-- Users
DROP POLICY IF EXISTS "Permissive select for users" ON public.users;
DROP POLICY IF EXISTS "Permissive insert for users" ON public.users;
DROP POLICY IF EXISTS "Permissive update for users" ON public.users;
DROP POLICY IF EXISTS "Permissive delete for users" ON public.users;
CREATE POLICY "Users can view all users" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (id::text = current_setting('app.user_id', true));
CREATE POLICY "Admins can manage all users" ON public.users FOR ALL USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- Settings
DROP POLICY IF EXISTS "Permissive select for settings" ON public.settings;
DROP POLICY IF EXISTS "Permissive insert for settings" ON public.settings;
DROP POLICY IF EXISTS "Permissive update for settings" ON public.settings;
DROP POLICY IF EXISTS "Permissive delete for settings" ON public.settings;
CREATE POLICY "Users can view settings" ON public.settings FOR SELECT USING (true);
CREATE POLICY "Admins can manage settings" ON public.settings FOR ALL USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- Projects
DROP POLICY IF EXISTS "Permissive select for projects" ON public.projects;
DROP POLICY IF EXISTS "Permissive insert for projects" ON public.projects;
DROP POLICY IF EXISTS "Permissive update for projects" ON public.projects;
DROP POLICY IF EXISTS "Permissive delete for projects" ON public.projects;
CREATE POLICY "Users can view all projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "Users can insert projects" ON public.projects FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update projects" ON public.projects FOR UPDATE USING (true);
CREATE POLICY "Admins can delete projects" ON public.projects FOR DELETE USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- Issues
DROP POLICY IF EXISTS "Permissive select for issues" ON public.issues;
DROP POLICY IF EXISTS "Permissive insert for issues" ON public.issues;
DROP POLICY IF EXISTS "Permissive update for issues" ON public.issues;
DROP POLICY IF EXISTS "Permissive delete for issues" ON public.issues;
CREATE POLICY "Enable all for issues" ON public.issues FOR ALL USING (true) WITH CHECK (true);

-- Innovations
DROP POLICY IF EXISTS "Permissive select for innovations" ON public.innovations;
DROP POLICY IF EXISTS "Permissive insert for innovations" ON public.innovations;
DROP POLICY IF EXISTS "Permissive update for innovations" ON public.innovations;
DROP POLICY IF EXISTS "Permissive delete for innovations" ON public.innovations;
CREATE POLICY "Users can view all innovations" ON public.innovations FOR SELECT USING (true);
CREATE POLICY "Users can insert innovations" ON public.innovations FOR INSERT WITH CHECK (true);
CREATE POLICY "Authors can update their innovations" ON public.innovations FOR UPDATE USING (author_id::text = current_setting('app.user_id', true));

-- Interruption Types
DROP POLICY IF EXISTS "Permissive select for interruption_types" ON public.interruption_types;
DROP POLICY IF EXISTS "Permissive insert for interruption_types" ON public.interruption_types;
DROP POLICY IF EXISTS "Permissive update for interruption_types" ON public.interruption_types;
DROP POLICY IF EXISTS "Permissive delete for interruption_types" ON public.interruption_types;
CREATE POLICY "Users can view active interruption types" ON public.interruption_types FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage interruption types" ON public.interruption_types FOR ALL USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- Interruptions
DROP POLICY IF EXISTS "Permissive select for interruptions" ON public.interruptions;
DROP POLICY IF EXISTS "Permissive insert for interruptions" ON public.interruptions;
DROP POLICY IF EXISTS "Permissive update for interruptions" ON public.interruptions;
DROP POLICY IF EXISTS "Permissive delete for interruptions" ON public.interruptions;
CREATE POLICY "Users can view all interruptions" ON public.interruptions FOR SELECT USING (true);
CREATE POLICY "Users can insert interruptions" ON public.interruptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Designers can update their interruptions" ON public.interruptions FOR UPDATE USING (designer_id::text = current_setting('app.user_id', true));

-- Activity Types
DROP POLICY IF EXISTS "Permissive select for activity_types" ON public.activity_types;
DROP POLICY IF EXISTS "Permissive insert for activity_types" ON public.activity_types;
DROP POLICY IF EXISTS "Permissive update for activity_types" ON public.activity_types;
DROP POLICY IF EXISTS "Permissive delete for activity_types" ON public.activity_types;
CREATE POLICY "Users can view active activity types" ON public.activity_types FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage activity types" ON public.activity_types FOR ALL USING (current_setting('app.user_role', true) IN ('GESTOR', 'CEO'));

-- Operational Activities
DROP POLICY IF EXISTS "Permissive select for operational_activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Permissive insert for operational_activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Permissive update for operational_activities" ON public.operational_activities;
DROP POLICY IF EXISTS "Permissive delete for operational_activities" ON public.operational_activities;
CREATE POLICY "Users can view all operational activities" ON public.operational_activities FOR SELECT USING (true);
CREATE POLICY "Users can insert their own activities" ON public.operational_activities FOR INSERT WITH CHECK (user_id::text = current_setting('app.user_id', true));
CREATE POLICY "Users can update their own activities" ON public.operational_activities FOR UPDATE USING (user_id::text = current_setting('app.user_id', true));

-- Reload PostgREST cache
NOTIFY pgrst, 'reload config';
