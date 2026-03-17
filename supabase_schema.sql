-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users Table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  username text unique not null,
  password text not null,
  name text not null,
  role text not null check (role in ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS')),
  salary numeric default 0,
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
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.projects enable row level security;
alter table public.issues enable row level security;
alter table public.innovations enable row level security;

-- Create policies for public access (Prototype Mode)
-- CAUTION: This allows anyone with the anon key to read/write. 
-- For production, integrate Supabase Auth and restrict these policies.

create policy "Enable read access for all users" on public.users for select using (true);
create policy "Enable insert access for all users" on public.users for insert with check (true);
create policy "Enable update access for all users" on public.users for update using (true);
create policy "Enable delete access for all users" on public.users for delete using (true);

create policy "Enable read access for all projects" on public.projects for select using (true);
create policy "Enable insert access for all projects" on public.projects for insert with check (true);
create policy "Enable update access for all projects" on public.projects for update using (true);
create policy "Enable delete access for all projects" on public.projects for delete using (true);

create policy "Enable read access for all issues" on public.issues for select using (true);
create policy "Enable insert access for all issues" on public.issues for insert with check (true);
create policy "Enable update access for all issues" on public.issues for update using (true);
create policy "Enable delete access for all issues" on public.issues for delete using (true);

create policy "Enable read access for all innovations" on public.innovations for select using (true);
create policy "Enable insert access for all innovations" on public.innovations for insert with check (true);
create policy "Enable update access for all innovations" on public.innovations for update using (true);
create policy "Enable delete access for all innovations" on public.innovations for delete using (true);

-- Activity Types Table
create table if not exists public.activity_types (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  is_active boolean default true,
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
  created_at timestamptz default now()
);

-- Enable RLS
alter table public.activity_types enable row level security;
alter table public.operational_activities enable row level security;

-- Policies
create policy "Enable read access for all activity_types" on public.activity_types for select using (true);
create policy "Enable insert access for all activity_types" on public.activity_types for insert with check (true);
create policy "Enable update access for all activity_types" on public.activity_types for update using (true);
create policy "Enable delete access for all activity_types" on public.activity_types for delete using (true);

create policy "Enable read access for all operational_activities" on public.operational_activities for select using (true);
create policy "Enable insert access for all operational_activities" on public.operational_activities for insert with check (true);
create policy "Enable update access for all operational_activities" on public.operational_activities for update using (true);
create policy "Enable delete access for all operational_activities" on public.operational_activities for delete using (true);
