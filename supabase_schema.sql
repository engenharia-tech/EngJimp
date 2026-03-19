-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users Table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  password text not null,
  name text not null,
  surname text,
  phone text,
  role text not null check (role in ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR')),
  salary numeric default 0,
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
  estimated_seconds integer,
  pauses jsonb default '[]'::jsonb,
  variations jsonb default '[]'::jsonb,
  status text not null check (status in ('COMPLETED', 'IN_PROGRESS')),
  notes text,
  user_id uuid references public.users(id),
  tenant_id uuid,
  created_at timestamptz default now()
);

-- Issues Table
create table if not exists public.issues (
  id uuid primary key default uuid_generate_v4(),
  project_ns text not null,
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
  status text not null check (status in ('PENDING', 'APPROVED', 'REJECTED', 'IMPLEMENTED')),
  author_id uuid references public.users(id),
  tenant_id uuid,
  created_at timestamptz default now()
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
alter table public.projects enable row level security;
alter table public.issues enable row level security;
alter table public.innovations enable row level security;
alter table public.activity_types enable row level security;
alter table public.operational_activities enable row level security;

-- Tenant Helper Function
CREATE OR REPLACE FUNCTION public.my_tenant_id()
RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT tenant_id FROM public.users WHERE id = auth.uid() $$;

-- RLS Policies

-- Users
create policy "Users can see users from same tenant" on public.users 
  for select using (tenant_id = public.my_tenant_id());
create policy "Users can insert users for same tenant" on public.users 
  for insert with check (tenant_id = public.my_tenant_id());
create policy "Users can update users from same tenant" on public.users 
  for update using (tenant_id = public.my_tenant_id());
create policy "Users can delete users from same tenant" on public.users 
  for delete using (tenant_id = public.my_tenant_id());

-- Projects
create policy "Users can see projects from same tenant" on public.projects 
  for select using (tenant_id = public.my_tenant_id());
create policy "Users can insert projects for same tenant" on public.projects 
  for insert with check (tenant_id = public.my_tenant_id());
create policy "Users can update projects from same tenant" on public.projects 
  for update using (tenant_id = public.my_tenant_id());
create policy "Users can delete projects from same tenant" on public.projects 
  for delete using (tenant_id = public.my_tenant_id());

-- Issues
create policy "Users can see issues from same tenant" on public.issues 
  for select using (tenant_id = public.my_tenant_id());
create policy "Users can insert issues for same tenant" on public.issues 
  for insert with check (tenant_id = public.my_tenant_id());
create policy "Users can update issues from same tenant" on public.issues 
  for update using (tenant_id = public.my_tenant_id());
create policy "Users can delete issues from same tenant" on public.issues 
  for delete using (tenant_id = public.my_tenant_id());

-- Innovations
create policy "Users can see innovations from same tenant" on public.innovations 
  for select using (tenant_id = public.my_tenant_id());
create policy "Users can insert innovations for same tenant" on public.innovations 
  for insert with check (tenant_id = public.my_tenant_id());
create policy "Users can update innovations from same tenant" on public.innovations 
  for update using (tenant_id = public.my_tenant_id());
create policy "Users can delete innovations from same tenant" on public.innovations 
  for delete using (tenant_id = public.my_tenant_id());

-- Activity Types
create policy "Users can see activity_types from same tenant" on public.activity_types 
  for select using (tenant_id = public.my_tenant_id());
create policy "Users can insert activity_types for same tenant" on public.activity_types 
  for insert with check (tenant_id = public.my_tenant_id());
create policy "Users can update activity_types from same tenant" on public.activity_types 
  for update using (tenant_id = public.my_tenant_id());
create policy "Users can delete activity_types from same tenant" on public.activity_types 
  for delete using (tenant_id = public.my_tenant_id());

-- Operational Activities
create policy "Users can see operational_activities from same tenant" on public.operational_activities 
  for select using (tenant_id = public.my_tenant_id());
create policy "Users can insert operational_activities for same tenant" on public.operational_activities 
  for insert with check (tenant_id = public.my_tenant_id());
create policy "Users can update operational_activities from same tenant" on public.operational_activities 
  for update using (tenant_id = public.my_tenant_id());
create policy "Users can delete operational_activities from same tenant" on public.operational_activities 
  for delete using (tenant_id = public.my_tenant_id());

-- Reload PostgREST cache
NOTIFY pgrst, 'reload config';
