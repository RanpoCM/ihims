-- =============================================================================
-- IHIMS — Supabase Migration: employees table
-- Run this in your Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. employees table
--    Matches the shape of the localStorage employee records exactly, with
--    snake_case column names (JS layer converts camelCase ↔ snake_case).
-- ---------------------------------------------------------------------------
create table if not exists public.employees (
  id                    bigint generated always as identity primary key,
  name                  text        not null,
  role                  text        not null,
  department            text        not null,
  performance           int         not null default 80 check (performance between 0 and 100),
  competency            int         not null default 80 check (competency between 0 and 100),
  training              int         not null default 80 check (training between 0 and 100),
  manager_employee_id   bigint      references public.employees(id) on delete set null,
  qualifications        text,
  employment_status     text        default 'Regular',
  date_hired            date,
  competency_notes      text        default '',
  photo                 text,                   -- base64 data URL or storage URL
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Keep updated_at current automatically
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists employees_updated_at on public.employees;
create trigger employees_updated_at
  before update on public.employees
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. accounts table
--    Links a Supabase Auth user (auth.uid()) to an IHIMS role/employee.
--    This is the server-side source of truth for roles — the client-side
--    localStorage accounts array becomes read-only after this migration,
--    with Supabase Auth as the authoritative identity layer.
-- ---------------------------------------------------------------------------
create table if not exists public.accounts (
  id            bigint      generated always as identity primary key,
  auth_uid      uuid        references auth.users(id) on delete cascade,
  email         text        not null unique,
  username      text        unique,
  name          text,
  role          text        not null default 'staff',   -- primary role (cosmetic)
  roles         jsonb       not null default '["staff"]'::jsonb, -- all assigned roles
  status        text        not null default 'active' check (status in ('active', 'disabled')),
  employee_id   bigint      references public.employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at
  before update on public.accounts
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security
--    Enforces RBAC at the database level — matches the client-side rbac.js
--    logic but is server-enforced, so a compromised client can't bypass it.
-- ---------------------------------------------------------------------------
alter table public.employees enable row level security;
alter table public.accounts  enable row level security;

-- Helper: get the roles array for the currently authenticated user.
-- Used inside RLS policies to avoid repeating the subquery.
create or replace function public.current_user_roles()
returns jsonb language sql security definer stable as $$
  select roles from public.accounts where auth_uid = auth.uid() limit 1
$$;

-- Helper: check if the current user has a specific role.
create or replace function public.has_role(r text)
returns boolean language sql security definer stable as $$
  select coalesce(
    (select roles @> jsonb_build_array(r)
     from public.accounts where auth_uid = auth.uid() limit 1),
    false
  )
$$;

-- ── employees policies ──────────────────────────────────────────────────────

-- Admin and HR can read ALL employees
create policy "employees_select_admin_hr" on public.employees
  for select
  using (public.has_role('admin') or public.has_role('hr'));

-- Staff can only read their own linked record
create policy "employees_select_staff_own" on public.employees
  for select
  using (
    exists (
      select 1 from public.accounts
      where accounts.auth_uid = auth.uid()
        and accounts.employee_id = employees.id
    )
  );

-- Only Admin and HR can insert employees
create policy "employees_insert_admin_hr" on public.employees
  for insert
  with check (public.has_role('admin') or public.has_role('hr'));

-- Only Admin and HR can update employees
create policy "employees_update_admin_hr" on public.employees
  for update
  using (public.has_role('admin') or public.has_role('hr'));

-- Only Admin can delete employees
create policy "employees_delete_admin" on public.employees
  for delete
  using (public.has_role('admin'));

-- ── accounts policies ───────────────────────────────────────────────────────

-- Everyone can read their own account
create policy "accounts_select_own" on public.accounts
  for select
  using (auth_uid = auth.uid());

-- Admin can read all accounts
create policy "accounts_select_admin" on public.accounts
  for select
  using (public.has_role('admin'));

-- Admin can insert/update/delete accounts
create policy "accounts_write_admin" on public.accounts
  for all
  using (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- 4. Seed the two owner admin accounts
--    Replace the email values with your real ones if different.
--    The auth_uid will be populated automatically when the user first logs
--    in via Supabase Auth OTP and the link_auth_uid trigger fires (see §5).
-- ---------------------------------------------------------------------------
insert into public.accounts (email, username, name, role, roles, status)
values
  ('carlos18miguel@gmail.com', 'carlos18miguel', 'Carlos Miguel', 'admin', '["admin","hr","staff"]', 'active'),
  ('ihimsadmin@gmail.com',     'ihimsadmin',     'IHIMS Admin',   'admin', '["admin"]',              'active')
on conflict (email) do nothing;

-- ---------------------------------------------------------------------------
-- 5. Auto-link auth.uid() to the accounts table on first OTP login.
--    When Supabase Auth creates/confirms a session, this trigger sets
--    accounts.auth_uid so RLS policies can find the user's roles.
-- ---------------------------------------------------------------------------
create or replace function public.link_auth_uid()
returns trigger language plpgsql security definer as $$
begin
  update public.accounts
  set auth_uid = new.id
  where email = new.email
    and auth_uid is null;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.link_auth_uid();

-- Also handle cases where the user already existed in auth.users
-- (run once manually to back-fill existing auth users):
-- update public.accounts a
-- set auth_uid = u.id
-- from auth.users u
-- where u.email = a.email and a.auth_uid is null;

-- ---------------------------------------------------------------------------
-- 6. Seed employee data (matches your initialEmployees in App.jsx)
-- ---------------------------------------------------------------------------
insert into public.employees (name, role, department, performance, competency, training, manager_employee_id, qualifications, employment_status, date_hired, competency_notes)
values
  ('Dr. Sarah Johnson',  'Chief Medical Officer', 'Cardiology',     95, 92, 98, null, 'MD, Board Certified Cardiologist, PRC Lic. No. 0012345', 'Regular',     '2018-03-01', ''),
  ('Dr. Michael Chen',   'Cardiologist',          'Cardiology',     91, 88, 90, 1,    'MD, Fellow Philippine College of Cardiology',            'Regular',     '2019-06-15', ''),
  ('James Wilson',       'Senior Nurse',          'Nursing',        88, 85, 92, 1,    'BSN, RN, PRC Lic. No. 0045678',                          'Regular',     '2020-01-10', ''),
  ('Dr. Lisa Anderson',  'Pediatrician',          'Pediatrics',     93, 90, 95, 1,    'MD, Diplomate Philippine Pediatric Society',              'Regular',     '2019-09-01', ''),
  ('Emily Brown',        'Lab Technician',        'Laboratory',     84, 82, 86, null, 'BS Medical Technology, RMT, PRC Lic. No. 0078901',       'Regular',     '2021-02-20', ''),
  ('Maria Garcia',       'Registered Nurse',      'Nursing',        86, 84, 88, 3,    'BSN, RN, PRC Lic. No. 0056789',                          'Probationary', '2025-01-05', ''),
  ('Robert Taylor',      'Administrator',         'Administration', 82, 80, 84, 8,    'BS Business Administration, MBA',                        'Regular',     '2020-07-01', ''),
  ('David Martinez',     'HR Manager',            'Administration', 80, 78, 82, null, 'BS Psychology, SHRM-CP',                                 'Regular',     '2018-11-15', '')
on conflict do nothing;