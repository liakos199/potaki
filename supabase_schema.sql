-- Supabase Schema Setup for Role-Based Bar Management App
-- Includes: profiles, bars, staff_assignments, RLS, promote_to_staff function, and test data

-- 0. Create trigger function to insert profile after new user
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- 0.1. Create trigger on auth.users to call the function after insert
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- 1. Enable Extensions
create extension if not exists "uuid-ossp";

-- 2. Profiles Table (linked to auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  role text not null default 'customer' check (role in ('customer', 'staff', 'owner')),
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Bars Table
create table public.bars (
  id uuid not null default extensions.uuid_generate_v4 (),
  name text not null,
  owner_id uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  address character varying(255) not null,
  phone character varying(20) not null,
  website character varying(255) null,
  description text null,
  location geography not null,
  constraint bars_pkey primary key (id),
  constraint bars_owner_id_fkey foreign KEY (owner_id) references profiles (id) on delete CASCADE
) TABLESPACE pg_default;

-- 4. Staff Assignments Table (junction)
create table if not exists public.staff_assignments (
  id uuid primary key default uuid_generate_v4(),
  staff_user_id uuid not null references public.profiles(id) on delete cascade,
  bar_id uuid not null references public.bars(id) on delete cascade,
  assigned_by_owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (staff_user_id, bar_id)
);

-- 5. Seat Options Table and Type
create type seat_option_type as enum ('bar', 'table', 'vip');

create table seat_options (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid references bars(id) on delete cascade,
  type seat_option_type not null,
  enabled boolean not null default true,
  available_count integer not null,
  min_people integer not null,
  max_people integer not null,
  unique (bar_id, type)
);

-- 6. Drink Options Table and Type
create type drink_option_type as enum ('single-drink', 'bottle');

create table if not exists public.drink_options (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references bars(id) on delete cascade,
  type drink_option_type not null,
  name text, -- Only for bottles, nullable for single-drink
  price numeric(8,2) not null check (price > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only one single-drink per bar, but multiple bottles
  unique (bar_id, type, name)
);



-- 7. RLS Policies
-- Profiles RLS
alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile (not role)" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Enable read access for all users" on public.profiles for select to public using (true);
-- Deny direct updates to role by anyone except admin (handled outside RLS)

-- Bars RLS
alter table public.bars enable row level security;
create policy "All authenticated users can view bars" on public.bars for select using (auth.role() = 'authenticated');
create policy "Only owners can insert bars" on public.bars for insert with check ((select role from public.profiles where id = auth.uid()) = 'owner');
create policy "Only owner can update their bar" on public.bars for update using (owner_id = auth.uid());
create policy "Only owner can delete their bar" on public.bars for delete using (owner_id = auth.uid());

-- Staff Assignments RLS
alter table public.staff_assignments enable row level security;
create policy "Staff can view their assignments" on public.staff_assignments for select using (staff_user_id = auth.uid());
create policy "Owners can view assignments for their bars" on public.staff_assignments for select using (exists (select 1 from bars where bars.id = staff_assignments.bar_id and bars.owner_id = auth.uid()));
create policy "Owners can delete assignments for their bars" on public.staff_assignments for delete using (exists (select 1 from bars where bars.id = staff_assignments.bar_id and bars.owner_id = auth.uid()));
-- Deny direct inserts: only the function can insert
create policy "No direct inserts" on public.staff_assignments for insert with check (false);


-- Drink Options RLS
alter table public.drink_options enable row level security;
-- Owners can manage drinks for their bars
create policy "Owner can manage drinks for their bar"
  on public.drink_options
  using (exists (select 1 from bars where bars.id = bar_id and bars.owner_id = auth.uid()))
  with check (exists (select 1 from bars where bars.id = bar_id and bars.owner_id = auth.uid()));

-- 8. Secure Function: promote_to_staff
create or replace function public.promote_to_staff(target_user_id uuid, assigned_bar_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  owner_role text;
  target_role text;
  bar_owner uuid;
  already_assigned int;
begin
  -- Ensure caller is owner
  select role into owner_role from public.profiles where id = auth.uid();
  if owner_role is null or owner_role <> 'owner' then
    raise exception 'Only owners can promote staff.';
  end if;

  -- Ensure target is customer
  select role into target_role from public.profiles where id = target_user_id;
  if target_role is null or target_role <> 'customer' then
    raise exception 'Target user must be a customer.';
  end if;

  -- Ensure bar belongs to caller
  select owner_id into bar_owner from public.bars where id = assigned_bar_id;
  if bar_owner is null or bar_owner <> auth.uid() then
    raise exception 'Bar does not belong to caller.';
  end if;

  -- Ensure not already assigned
  select count(*) into already_assigned from public.staff_assignments where staff_user_id = target_user_id and bar_id = assigned_bar_id;
  if already_assigned > 0 then
    raise exception 'User already assigned to this bar.';
  end if;

  -- Update role and insert assignment
  update public.profiles set role = 'staff', updated_at = now() where id = target_user_id;
  insert into public.staff_assignments (staff_user_id, bar_id, assigned_by_owner_id) values (target_user_id, assigned_bar_id, auth.uid());
end;
$$;

grant execute on function public.promote_to_staff(uuid, uuid) to authenticated;


-- Demote staff to customer (function)
create or replace function public.demote_staff(target_user_id uuid, bar_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- 1. Delete the staff assignment for this bar
  delete from public.staff_assignments
  where staff_user_id = demote_staff.target_user_id
    and staff_assignments.bar_id = demote_staff.bar_id;

  -- 2. If the user has no other staff assignments, set their role to 'customer'
  if not exists (
    select 1 from public.staff_assignments
    where staff_user_id = demote_staff.target_user_id
  ) then
    update public.profiles
    set role = 'customer'
    where id = demote_staff.target_user_id;
  end if;
end;
$$;

grant execute on function public.demote_staff(uuid, uuid) to authenticated;

-- function/trigger to update the updated_at column for drink options table
create or replace function update_updated_at_column()
returns trigger as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$ language plpgsql;

create trigger update_drink_options_updated_at
before update on public.drink_options
for each row
execute procedure update_updated_at_column();