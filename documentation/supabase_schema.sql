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


--7. Operating Hours
-- Define ENUM for day of the week (ISO 8601 standard: Monday=1, Sunday=7)
CREATE TYPE day_of_week_enum AS ENUM ('1', '2', '3', '4', '5', '6', '7'); -- Monday to Sunday

-- Operating Hours Table
CREATE TABLE public.operating_hours (
    id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
    day_of_week day_of_week_enum NOT NULL, -- Day of the week (1-7)
    open_time TIME NOT NULL, -- Local opening time (e.g., '18:00:00')
    close_time TIME NOT NULL, -- Local closing time (e.g., '02:00:00')
    closes_next_day BOOLEAN NOT NULL DEFAULT false, -- Set to TRUE if close_time is on the day *after* the open_time day (e.g., open Mon 8 PM, close Tue 2 AM)

    -- Ensure only one entry per bar per day of the week
    UNIQUE (bar_id, day_of_week)
);

-- Index for faster lookup of hours for a specific bar
CREATE INDEX idx_operating_hours_bar_id ON public.operating_hours(bar_id);

--8. Bar Operating Exceptions
-- Create Bar Operating Exceptions Table
CREATE TABLE IF NOT EXISTS public.bar_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
    exception_date date NOT NULL, -- The specific date this exception applies to
    is_closed boolean NOT NULL DEFAULT false, -- TRUE = bar is fully closed this date.
    open_time TIME NULL, -- If is_closed=FALSE, defines special opening time.
    close_time TIME NULL, -- If is_closed=FALSE, defines special closing time.
    closes_next_day BOOLEAN NULL, -- If is_closed=FALSE, needed if special hours cross midnight.
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (bar_id, exception_date), -- Only one exception per bar per date
    CONSTRAINT check_exception_hours CHECK (
        (is_closed = TRUE) OR -- If closed, specific hours are irrelevant (can be NULL)
        (is_closed = FALSE AND open_time IS NOT NULL AND close_time IS NOT NULL AND closes_next_day IS NOT NULL) -- If open with special hours, times must be specified
    )
);
-- Add index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_bar_exceptions_bar_id_date ON public.bar_exceptions(bar_id, exception_date);

--9. Reservations
-- 1. CREATE ENUM TYPE (If not already done)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');
  END IF;
END $$;

-- 2. CREATE RESERVATIONS TABLE (Without the problematic CHECK constraint)
CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL, -- Or ON DELETE CASCADE
  bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  seat_option_id uuid NOT NULL REFERENCES public.seat_options(id) ON DELETE CASCADE,
  reservation_date date NOT NULL,
  party_size smallint NOT NULL CHECK (party_size > 0),
  status reservation_status NOT NULL DEFAULT 'confirmed',
  special_requests text NULL,
  checked_in_at TIMESTAMPTZ NULL, -- Timestamp when guest was checked in
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
  -- Removed the CHECK constraint that used a subquery
);

-- 3. CREATE THE TRIGGER FUNCTION
CREATE OR REPLACE FUNCTION public.check_reservation_seat_option_bar_match()
RETURNS TRIGGER AS $$
DECLARE
  v_seat_option_bar_id uuid;
BEGIN
  -- Find the bar_id associated with the given seat_option_id
  SELECT bar_id INTO v_seat_option_bar_id
  FROM public.seat_options
  WHERE id = NEW.seat_option_id; -- NEW refers to the row being inserted or updated

  -- Check if the seat option's bar_id matches the reservation's bar_id
  IF v_seat_option_bar_id IS NULL OR v_seat_option_bar_id <> NEW.bar_id THEN
    RAISE EXCEPTION 'Seat option ID % does not belong to bar ID %', NEW.seat_option_id, NEW.bar_id;
  END IF;

  -- If the check passes, allow the operation to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. CREATE THE TRIGGER on the reservations table
DROP TRIGGER IF EXISTS enforce_seat_option_bar_match ON public.reservations; -- Drop if exists for idempotency
CREATE TRIGGER enforce_seat_option_bar_match
  BEFORE INSERT OR UPDATE ON public.reservations -- Fire before inserting or updating
  FOR EACH ROW -- Execute the function for each affected row
  EXECUTE FUNCTION public.check_reservation_seat_option_bar_match(); -- Call the function

-- 5. Add Indexes (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON public.reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_bar_id_date ON public.reservations(bar_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_seat_option_id_date ON public.reservations(seat_option_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_checked_in_at ON public.reservations(checked_in_at);

-- 6. ADD UPDATE TRIGGER (if needed and function exists)
-- Assumes 'update_updated_at_column' function exists
DROP TRIGGER IF EXISTS update_reservations_updated_at ON public.reservations;
CREATE TRIGGER update_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


  -- == 1. Create reservation_drinks Table with ON DELETE SET NULL ==
CREATE TABLE IF NOT EXISTS public.reservation_drinks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique ID for this line item
    reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE, -- Link to the reservation

    drink_option_id uuid NULL REFERENCES public.drink_options(id) ON DELETE SET NULL,
    -- ^ Made NULLABLE and set ON DELETE SET NULL

    quantity smallint NOT NULL CHECK (quantity > 0), -- How many units of this drink
    price_at_booking numeric(8, 2) NOT NULL CHECK (price_at_booking >= 0), -- Price *per unit* when the reservation was made/drink added
    created_at timestamptz NOT NULL DEFAULT now()
);

-- == 2. Add Indexes ==
CREATE INDEX IF NOT EXISTS idx_reservation_drinks_reservation_id ON public.reservation_drinks(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_drinks_drink_option_id ON public.reservation_drinks(drink_option_id);

-- == 3. Create Trigger Function for Bar Matching ==
CREATE OR REPLACE FUNCTION public.check_reservation_drink_bar_match()
RETURNS TRIGGER AS $$
DECLARE
  v_reservation_bar_id uuid;
  v_drink_option_bar_id uuid;
BEGIN
  -- Only perform the check if drink_option_id is being set (not if it's already NULL)
  IF NEW.drink_option_id IS NOT NULL THEN
    SELECT bar_id INTO v_reservation_bar_id
    FROM public.reservations
    WHERE id = NEW.reservation_id;

    SELECT bar_id INTO v_drink_option_bar_id
    FROM public.drink_options
    WHERE id = NEW.drink_option_id;

    IF v_reservation_bar_id IS NULL OR v_drink_option_bar_id IS NULL OR v_reservation_bar_id <> v_drink_option_bar_id THEN
      RAISE EXCEPTION 'Drink option ID % does not belong to the bar (ID %) of reservation ID %',
        NEW.drink_option_id, v_reservation_bar_id, NEW.reservation_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- == 4. Create Trigger on reservation_drinks Table ==
DROP TRIGGER IF EXISTS enforce_drink_bar_match ON public.reservation_drinks; -- Drop if exists
CREATE TRIGGER enforce_drink_bar_match
  BEFORE INSERT OR UPDATE ON public.reservation_drinks
  FOR EACH ROW
  EXECUTE FUNCTION public.check_reservation_drink_bar_match();

-- == 5. Enable RLS and Add SELECT Policies (Examples) ==
ALTER TABLE public.reservation_drinks ENABLE ROW LEVEL SECURITY;

-- Allow customer to view drinks associated with their own reservations
CREATE POLICY "Allow customer view own reservation drinks" ON public.reservation_drinks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_drinks.reservation_id AND r.customer_id = auth.uid())
  );

-- Allow owner/staff to view drinks associated with reservations for their bar
CREATE POLICY "Allow owner/staff view reservation drinks for their bar" ON public.reservation_drinks
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.reservations r JOIN public.bars b ON r.bar_id = b.id WHERE r.id = reservation_drinks.reservation_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.reservations r JOIN public.staff_assignments sa ON r.bar_id = sa.bar_id WHERE r.id = reservation_drinks.reservation_id AND sa.staff_user_id = auth.uid())
  );








  -------------------------------------------------------------------

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