-- Revised Database Schema for MSREG Yard Sign Tracker
-- Run this in the Supabase SQL Editor

-- 1. Create Profiles Table (extends auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  role text not null check (role in ('manager', 'admin')) default 'manager',
  created_at timestamp with time zone default now()
);

-- 2. Create Signs Table
create table if not exists public.signs (
  id uuid default gen_random_uuid() primary key,
  short_id text not null unique,
  qr_token text not null unique,
  label text,
  status text not null check (status in ('deliver', 'pickup', 'return')) default 'return',
  current_holder uuid references public.profiles(id) on delete set null,
  current_holder_name text, -- fallback text name for anonymous custody tracking
  last_property_address text, -- tracks where it is deployed
  created_at timestamp with time zone default now()
);

-- 3. Create Scans Table (append-only log)
create table if not exists public.scans (
  id uuid default gen_random_uuid() primary key,
  sign_id uuid references public.signs(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null, -- nullable for anonymous logs
  agent_name text, -- text field recording anonymous agent's name
  property_address text, -- recorded if status is 'deliver'
  action text not null check (action in ('deliver', 'pickup', 'return')),
  latitude double precision not null,
  longitude double precision not null,
  notes text,
  created_at timestamp with time zone default now()
);

-- 4. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;
alter table public.signs enable row level security;
alter table public.scans enable row level security;

-- 5. Helper Function to Check Authorized Role (Both admin and manager)
create or replace function public.is_admin()
returns boolean security definer as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'manager')
  );
end;
$$ language plpgsql;

-- 6. RLS Policies for Profiles
create policy "Allow authenticated users to read all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Allow users to update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- 7. RLS Policies for Signs
create policy "Allow authenticated users to read all signs"
  on public.signs for select
  to authenticated
  using (true);

-- Allow anonymous users to fetch sign detail (needed for scanner routing without login)
create policy "Allow anonymous users to read signs"
  on public.signs for select
  to anon
  using (true);

create policy "Allow admins to fully manage signs"
  on public.signs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 8. RLS Policies for Scans
create policy "Allow authenticated users to read all scans"
  on public.scans for select
  to authenticated
  using (true);

-- 9. Trigger for Auto-Creating Profiles on Auth Signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  is_first boolean;
begin
  select not exists (select 1 from public.profiles) into is_first;
  
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New Agent'),
    case when is_first then 'admin' else coalesce(new.raw_user_meta_data->>'role', 'manager') end
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 10. Security Definer Function to Log Scans (Exposed safely to public/anon)
create or replace function public.log_scan(
  p_sign_id uuid,
  p_action text,
  p_latitude double precision,
  p_longitude double precision,
  p_notes text,
  p_agent_name text,
  p_property_address text
)
returns void security definer as $$
declare
  v_user_id uuid;
  v_agent_name text;
begin
  v_user_id := auth.uid();
  
  -- If logged in, fetch their profile name, else use the provided name parameter
  if v_user_id is not null then
    select full_name into v_agent_name from public.profiles where id = v_user_id;
  else
    v_agent_name := p_agent_name;
  end if;

  -- 1. Insert scan log record
  insert into public.scans (
    sign_id, 
    user_id, 
    agent_name, 
    property_address, 
    action, 
    latitude, 
    longitude, 
    notes
  ) values (
    p_sign_id,
    v_user_id,
    v_agent_name,
    p_property_address,
    p_action,
    p_latitude,
    p_longitude,
    p_notes
  );

  -- 2. Update sign status, current holder name, and address
  update public.signs
  set 
    status = p_action,
    current_holder = case when p_action = 'pickup' then v_user_id else null end,
    current_holder_name = case when p_action = 'pickup' then v_agent_name else null end,
    last_property_address = case when p_action = 'deliver' then p_property_address else null end
  where id = p_sign_id;
end;
$$ language plpgsql;

-- 11. Backfill query: register existing users as Admin
insert into public.profiles (id, full_name, role)
select id, coalesce(raw_user_meta_data->>'full_name', 'Admin User'), 'admin'
from auth.users
on conflict (id) do update set role = 'admin';

update public.profiles set role = 'admin';
