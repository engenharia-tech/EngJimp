-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Helper function to get the current user's tenant_id
create or replace function public.my_tenant_id()
returns uuid as $$
  select tenant_id from public.users where id = auth.uid();
$$ language sql stable security definer;

-- Users Table (Linked to Supabase Auth)
create table if not exists public.users (
  id uuid primary key references auth.users(id),
  username text unique not null,
  name text not null,
  role text not null check (role in ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR')),
  salary numeric default 0,
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000000',
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
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000000',
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
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000000',
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
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000000',
  created_at timestamptz default now()
);

-- Activity Types Table
create table if not exists public.activity_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_active boolean default true,
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000000',
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
  tenant_id uuid not null default '00000000-0000-0000-0000-000000000000',
  created_at timestamptz default now()
);

-- Settings Table
create table if not exists public.settings (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid unique not null default '00000000-0000-0000-0000-000000000000',
  hourly_cost numeric default 0,
  company_name text,
  logo_url text,
  email_host text,
  email_port text,
  email_user text,
  email_pass text,
  email_from text,
  email_to text,
  interruption_email_to text,
  interruption_email_template text,
  updated_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.issues enable row level security;
alter table public.innovations enable row level security;
alter table public.activity_types enable row level security;
alter table public.operational_activities enable row level security;
alter table public.settings enable row level security;

-- Policies for Tenant Isolation
create policy "Tenant isolation for users" on public.users 
  for all using (tenant_id = my_tenant_id());

create policy "Tenant isolation for projects" on public.projects 
  for all using (tenant_id = my_tenant_id());

create policy "Tenant isolation for issues" on public.issues 
  for all using (tenant_id = my_tenant_id());

create policy "Tenant isolation for innovations" on public.innovations 
  for all using (tenant_id = my_tenant_id());

create policy "Tenant isolation for activity_types" on public.activity_types 
  for all using (tenant_id = my_tenant_id());

create policy "Tenant isolation for operational_activities" on public.operational_activities 
  for all using (tenant_id = my_tenant_id());

create policy "Tenant isolation for settings" on public.settings 
  for all using (tenant_id = my_tenant_id());
