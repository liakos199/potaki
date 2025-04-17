-- =====================================================================
-- == Supabase Schema: Bar Reservation System (Complete & Corrected) ==
-- =====================================================================
-- This schema includes tables for users (profiles), bars, operating hours,
-- date exceptions, seat types/options, reservations, drinks, staff assignments,
-- and related functions/triggers/RLS.

-- == 0. Extensions ==
CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; -- Still potentially used by Supabase internals, keep it. gen_random_uuid() is preferred now.
CREATE EXTENSION IF NOT EXISTS "postgis"; -- Required for the geography type

-- == 1. Custom Types ==

DO $$ BEGIN
  -- Type for Seat Options
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'seat_option_type') THEN
    CREATE TYPE public.seat_option_type AS ENUM ('bar', 'table', 'vip');
  END IF;
  -- Type for Drink Options
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'drink_option_type') THEN
    CREATE TYPE public.drink_option_type AS ENUM ('single-drink', 'bottle');
  END IF;
  -- Type for Reservation Status
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
    CREATE TYPE public.reservation_status AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');
  END IF;
  -- Type for Day of the Week
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'day_of_week_enum') THEN
    CREATE TYPE public.day_of_week_enum AS ENUM ('1', '2', '3', '4', '5', '6', '7'); -- Monday=1, Sunday=7
  END IF;
END $$;

-- == 2. Utility Functions ==

-- Function to automatically update 'updated_at' timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to handle new user creation from auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING; -- Avoid error if profile already exists
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if reservation seat option matches reservation bar
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
  IF v_seat_option_bar_id IS NULL THEN
     RAISE EXCEPTION 'Seat option ID % not found.', NEW.seat_option_id;
  END IF;
  IF v_seat_option_bar_id <> NEW.bar_id THEN
    RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Seat option ID % does not belong to bar ID %', NEW.seat_option_id, NEW.bar_id;
  END IF;

  -- If the check passes, allow the operation to proceed
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to check if reservation drink option matches reservation bar
CREATE OR REPLACE FUNCTION public.check_reservation_drink_bar_match()
RETURNS TRIGGER AS $$
DECLARE
  v_reservation_bar_id uuid;
  v_drink_option_bar_id uuid;
BEGIN
  -- Only perform the check if drink_option_id is being set (not if it's already NULL due to ON DELETE SET NULL)
  IF NEW.drink_option_id IS NOT NULL THEN
    -- Get the bar_id associated with the reservation
    SELECT bar_id INTO v_reservation_bar_id
    FROM public.reservations
    WHERE id = NEW.reservation_id;

    -- Get the bar_id associated with the drink option
    SELECT bar_id INTO v_drink_option_bar_id
    FROM public.drink_options
    WHERE id = NEW.drink_option_id;

    -- Check if lookups succeeded and if they match
    IF v_reservation_bar_id IS NULL THEN
       RAISE EXCEPTION 'INTERNAL_ERROR: Could not find bar for reservation ID %', NEW.reservation_id;
    END IF;
     IF v_drink_option_bar_id IS NULL THEN
       RAISE EXCEPTION 'INTERNAL_ERROR: Could not find bar for drink option ID %', NEW.drink_option_id;
    END IF;
    IF v_reservation_bar_id <> v_drink_option_bar_id THEN
      RAISE EXCEPTION 'DATA_INTEGRITY_VIOLATION: Drink option ID % does not belong to the bar (ID %) of reservation ID %',
        NEW.drink_option_id, v_reservation_bar_id, NEW.reservation_id;
    END IF;
  END IF; -- End check for non-NULL drink_option_id

  -- If the check passes (or wasn't needed), allow the operation
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- == 3. Tables ==

-- Profiles Table (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff', 'owner')),
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Trigger for updated_at on profiles
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


-- Bars Table
CREATE TABLE IF NOT EXISTS public.bars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  address character varying(255) NOT NULL,
  phone character varying(20) NULL, -- Made nullable
  website character varying(255) NULL,
  description text NULL,
  location geography(Point, 4326) NOT NULL, -- Specified Point type and SRID
  reservation_hold_until TIME NULL, -- Added hold time
  live boolean NOT NULL DEFAULT false, -- Existing column from user schema
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Trigger for updated_at on bars
DROP TRIGGER IF EXISTS update_bars_updated_at ON public.bars;
CREATE TRIGGER update_bars_updated_at BEFORE UPDATE ON public.bars FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
-- Optional: Add GiST index for location if doing proximity searches
CREATE INDEX IF NOT EXISTS bars_location_idx ON public.bars USING gist (location);


-- Staff Assignments Table (junction)
CREATE TABLE IF NOT EXISTS public.staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  assigned_by_owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE NO ACTION, -- Prevent deleting owner if they assigned staff
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_user_id, bar_id)
);
-- Note: No updated_at needed as assignments are usually created/deleted


-- Seat Options Table
CREATE TABLE IF NOT EXISTS public.seat_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE, -- Made NOT NULL
  type public.seat_option_type NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  available_count integer NOT NULL CHECK (available_count >= 0),
  min_people integer NOT NULL CHECK (min_people > 0),
  max_people integer NOT NULL CHECK (max_people >= min_people),
  UNIQUE (bar_id, type)
);


-- Drink Options Table
CREATE TABLE IF NOT EXISTS public.drink_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  type public.drink_option_type NOT NULL,
  name text NULL, -- Nullable for 'single-drink' type
  price numeric(8, 2) NOT NULL CHECK (price > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bar_id, type, name) -- Enforces uniqueness
);
-- Trigger for updated_at on drink_options
DROP TRIGGER IF EXISTS update_drink_options_updated_at ON public.drink_options;
CREATE TRIGGER update_drink_options_updated_at BEFORE UPDATE ON public.drink_options FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


-- Operating Hours Table
CREATE TABLE IF NOT EXISTS public.operating_hours (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
    day_of_week day_of_week_enum NOT NULL,
    open_time TIME NOT NULL,
    close_time TIME NOT NULL,
    closes_next_day BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (bar_id, day_of_week)
);
CREATE INDEX IF NOT EXISTS idx_operating_hours_bar_id ON public.operating_hours(bar_id);


-- Bar Operating Exceptions Table
CREATE TABLE IF NOT EXISTS public.bar_exceptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
    exception_date date NOT NULL,
    is_closed boolean NOT NULL DEFAULT false,
    open_time TIME NULL,
    close_time TIME NULL,
    closes_next_day BOOLEAN NULL,
    reason text NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (bar_id, exception_date),
    CONSTRAINT check_exception_hours CHECK (
        (is_closed = TRUE) OR
        (is_closed = FALSE AND open_time IS NOT NULL AND close_time IS NOT NULL AND closes_next_day IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS idx_bar_exceptions_bar_id_date ON public.bar_exceptions(bar_id, exception_date);
-- Trigger for updated_at on bar_exceptions
DROP TRIGGER IF EXISTS update_bar_exceptions_updated_at ON public.bar_exceptions;
CREATE TRIGGER update_bar_exceptions_updated_at BEFORE UPDATE ON public.bar_exceptions FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();


-- Reservations Table
CREATE TABLE IF NOT EXISTS public.reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL, -- Keeps reservation history if user deleted
  bar_id uuid NOT NULL REFERENCES public.bars(id) ON DELETE CASCADE,
  seat_option_id uuid NOT NULL REFERENCES public.seat_options(id) ON DELETE RESTRICT, -- Changed to RESTRICT
  reservation_date date NOT NULL,
  party_size smallint NOT NULL CHECK (party_size > 0),
  status public.reservation_status NOT NULL DEFAULT 'confirmed',
  special_requests text NULL,
  checked_in_at TIMESTAMPTZ NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
  -- NOTE: The check constraint using the subquery was replaced by a trigger below
);
-- Indexes for Reservations Table
CREATE INDEX IF NOT EXISTS idx_reservations_customer_id ON public.reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_reservations_bar_id_date ON public.reservations(bar_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_seat_option_id_date ON public.reservations(seat_option_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_checked_in_at ON public.reservations(checked_in_at);
-- Trigger for updated_at on reservations
DROP TRIGGER IF EXISTS update_reservations_updated_at ON public.reservations;
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();
-- Trigger to check seat option belongs to bar
DROP TRIGGER IF EXISTS enforce_seat_option_bar_match ON public.reservations;
CREATE TRIGGER enforce_seat_option_bar_match BEFORE INSERT OR UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION public.check_reservation_seat_option_bar_match();


-- Reservation Drinks Junction Table
CREATE TABLE IF NOT EXISTS public.reservation_drinks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reservation_id uuid NOT NULL REFERENCES public.reservations(id) ON DELETE CASCADE,
    drink_option_id uuid NULL REFERENCES public.drink_options(id) ON DELETE SET NULL, -- Set to NULL if drink deleted
    quantity smallint NOT NULL CHECK (quantity > 0),
    price_at_booking numeric(8, 2) NOT NULL CHECK (price_at_booking >= 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Indexes for Reservation Drinks Table
CREATE INDEX IF NOT EXISTS idx_reservation_drinks_reservation_id ON public.reservation_drinks(reservation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_drinks_drink_option_id ON public.reservation_drinks(drink_option_id);
-- Trigger to check drink belongs to reservation's bar
DROP TRIGGER IF EXISTS enforce_drink_bar_match ON public.reservation_drinks;
CREATE TRIGGER enforce_drink_bar_match BEFORE INSERT OR UPDATE ON public.reservation_drinks FOR EACH ROW EXECUTE FUNCTION public.check_reservation_drink_bar_match();


-- == 4. Triggers on Auth Schema ==

-- Trigger for handle_new_user on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users; -- Drop if exists
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- == 5. Staff Management Functions ==

-- Function to promote a customer to staff for a specific bar
CREATE OR REPLACE FUNCTION public.promote_to_staff(target_user_id uuid, assigned_bar_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_user_id uuid := auth.uid();
  caller_role text;
  target_role text;
  bar_owner_id_check uuid;
  already_assigned_count int;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = caller_user_id;
  IF caller_role IS NULL OR caller_role <> 'owner' THEN
    RAISE EXCEPTION 'AUTH_ERROR: Only owners can promote staff.';
  END IF;

  SELECT role INTO target_role FROM public.profiles WHERE id = target_user_id;
  IF target_role IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Target user does not exist.'; END IF;
  IF target_role <> 'customer' THEN RAISE EXCEPTION 'INVALID_ROLE: Target user must currently be a customer.'; END IF;

  SELECT owner_id INTO bar_owner_id_check FROM public.bars WHERE id = assigned_bar_id;
  IF bar_owner_id_check IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Bar does not exist.'; END IF;
  IF bar_owner_id_check <> caller_user_id THEN RAISE EXCEPTION 'AUTH_ERROR: Bar does not belong to the caller.'; END IF;

  SELECT count(*) INTO already_assigned_count FROM public.staff_assignments WHERE staff_user_id = target_user_id AND bar_id = assigned_bar_id;
  IF already_assigned_count > 0 THEN RAISE EXCEPTION 'CONFLICT: User already assigned as staff to this bar.'; END IF;

  UPDATE public.profiles SET role = 'staff', updated_at = now() WHERE id = target_user_id;
  INSERT INTO public.staff_assignments (staff_user_id, bar_id, assigned_by_owner_id) VALUES (target_user_id, assigned_bar_id, caller_user_id);
END;
$$;

-- Function to demote staff back to customer for a specific bar
CREATE OR REPLACE FUNCTION public.demote_staff(target_user_id uuid, target_bar_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_user_id uuid := auth.uid();
  caller_role text;
  bar_owner_id_check uuid;
  assignment_exists_count int;
  remaining_assignments_count int;
  target_current_role text;
BEGIN
  SELECT role INTO caller_role FROM public.profiles WHERE id = caller_user_id;
  IF caller_role IS NULL OR caller_role <> 'owner' THEN RAISE EXCEPTION 'AUTH_ERROR: Only owners can demote staff.'; END IF;

  SELECT owner_id INTO bar_owner_id_check FROM public.bars WHERE id = target_bar_id;
  IF bar_owner_id_check IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Bar does not exist.'; END IF;
  IF bar_owner_id_check <> caller_user_id THEN RAISE EXCEPTION 'AUTH_ERROR: Bar does not belong to the caller.'; END IF;

  SELECT count(*) INTO assignment_exists_count FROM public.staff_assignments WHERE staff_user_id = target_user_id AND bar_id = target_bar_id;
  IF assignment_exists_count = 0 THEN RAISE EXCEPTION 'NOT_FOUND: Staff assignment does not exist for this user and bar.'; END IF;

  DELETE FROM public.staff_assignments WHERE staff_user_id = target_user_id AND bar_id = target_bar_id;

  SELECT count(*) INTO remaining_assignments_count FROM public.staff_assignments WHERE staff_user_id = target_user_id;

  -- Check current role before potentially demoting
  SELECT role INTO target_current_role FROM public.profiles WHERE id = target_user_id;

  -- Only demote if they have no other staff assignments AND are not an owner
  IF remaining_assignments_count = 0 AND target_current_role <> 'owner' THEN
     UPDATE public.profiles SET role = 'customer', updated_at = now() WHERE id = target_user_id;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.promote_to_staff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.demote_staff(uuid, uuid) TO authenticated;


-- == 6. Row Level Security (RLS) Policies ==
-- !! Review and adapt these policies carefully !!

-- Profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile (not role)" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles; -- Consider if this is desired
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id); -- App logic should prevent role changes if needed
CREATE POLICY "Allow authenticated read access" ON public.profiles FOR SELECT USING (auth.role() = 'authenticated'); -- Example: Allow any logged in user to read basic profile info (name etc)

-- Bars RLS
ALTER TABLE public.bars ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All authenticated users can view bars" ON public.bars;
DROP POLICY IF EXISTS "Only owners can insert bars" ON public.bars;
DROP POLICY IF EXISTS "Only owner can update their bar" ON public.bars;
DROP POLICY IF EXISTS "Only owner can delete their bar" ON public.bars;
CREATE POLICY "Allow authenticated view all bars" ON public.bars FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow owner insert bar" ON public.bars FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'owner'));
CREATE POLICY "Allow owner update own bar" ON public.bars FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Allow owner delete own bar" ON public.bars FOR DELETE USING (auth.uid() = owner_id);

-- Staff Assignments RLS
ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can view their assignments" ON public.staff_assignments;
DROP POLICY IF EXISTS "Owners can view assignments for their bars" ON public.staff_assignments;
DROP POLICY IF EXISTS "Owners can delete assignments for their bars" ON public.staff_assignments;
DROP POLICY IF EXISTS "No direct inserts" ON public.staff_assignments;
DROP POLICY IF EXISTS "Disallow direct updates" ON public.staff_assignments;
CREATE POLICY "Allow owner/staff view relevant assignments" ON public.staff_assignments FOR SELECT
  USING (
    staff_user_id = auth.uid() -- Staff sees their own
    OR EXISTS (SELECT 1 FROM public.bars WHERE id = staff_assignments.bar_id AND owner_id = auth.uid()) -- Owner sees assignments for their bar
  );
CREATE POLICY "Allow owner delete assignments for their bar" ON public.staff_assignments FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.bars WHERE id = staff_assignments.bar_id AND owner_id = auth.uid()));
CREATE POLICY "Disallow direct inserts" ON public.staff_assignments FOR INSERT WITH CHECK (false); -- Force use of function
CREATE POLICY "Disallow direct updates" ON public.staff_assignments FOR UPDATE USING (false); -- Force use of function

-- Drink Options RLS
ALTER TABLE public.drink_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner can manage drinks for their bar" ON public.drink_options;
DROP POLICY IF EXISTS "Allow authenticated view all drink options" ON public.drink_options;
CREATE POLICY "Allow authenticated view all drink options" ON public.drink_options FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow owner/staff manage drinks for their bar" ON public.drink_options FOR ALL -- INSERT, UPDATE, DELETE
  USING (
    EXISTS (SELECT 1 FROM public.bars b WHERE b.id = drink_options.bar_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = drink_options.bar_id AND sa.staff_user_id = auth.uid())
  )
  WITH CHECK ( -- Ensure they only modify drinks for their bar
    EXISTS (SELECT 1 FROM public.bars b WHERE b.id = drink_options.bar_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = drink_options.bar_id AND sa.staff_user_id = auth.uid())
  );

-- Operating Hours RLS
ALTER TABLE public.operating_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read access to operating hours" ON public.operating_hours;
DROP POLICY IF EXISTS "Allow owner/staff manage hours for their bar" ON public.operating_hours;
CREATE POLICY "Allow authenticated read access to operating hours" ON public.operating_hours FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow owner/staff manage hours for their bar" ON public.operating_hours FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.bars b WHERE b.id = operating_hours.bar_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = operating_hours.bar_id AND sa.staff_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bars b WHERE b.id = operating_hours.bar_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = operating_hours.bar_id AND sa.staff_user_id = auth.uid())
  );

-- Bar Exceptions RLS
ALTER TABLE public.bar_exceptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated read access to exceptions" ON public.bar_exceptions;
DROP POLICY IF EXISTS "Allow owner/staff manage exceptions for their bar" ON public.bar_exceptions;
CREATE POLICY "Allow authenticated read access to exceptions" ON public.bar_exceptions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow owner/staff manage exceptions for their bar" ON public.bar_exceptions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.bars b WHERE b.id = bar_exceptions.bar_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = bar_exceptions.bar_id AND sa.staff_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bars b WHERE b.id = bar_exceptions.bar_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = bar_exceptions.bar_id AND sa.staff_user_id = auth.uid())
  );

-- Seat Options RLS
ALTER TABLE public.seat_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow authenticated view all seat options" ON public.seat_options;
DROP POLICY IF EXISTS "Allow owner/staff manage seat options for their bar" ON public.seat_options;
CREATE POLICY "Allow authenticated view all seat options" ON public.seat_options FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow owner/staff manage seat options for their bar" ON public.seat_options FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.bars b WHERE b.id = seat_options.bar_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = seat_options.bar_id AND sa.staff_user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.bars b WHERE b.id = seat_options.bar_id AND b.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = seat_options.bar_id AND sa.staff_user_id = auth.uid())
  );

-- Reservations RLS
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow customer view own reservations" ON public.reservations;
DROP POLICY IF EXISTS "Allow customer insert own reservations" ON public.reservations;
DROP POLICY IF EXISTS "Allow customer cancel own upcoming reservations" ON public.reservations;
DROP POLICY IF EXISTS "Allow owner/staff view reservations for their bar" ON public.reservations;
DROP POLICY IF EXISTS "Allow owner/staff manage reservations for their bar" ON public.reservations;
CREATE POLICY "Allow customer view own reservations" ON public.reservations FOR SELECT USING (auth.uid() = customer_id);
CREATE POLICY "Allow customer insert own reservations" ON public.reservations FOR INSERT WITH CHECK (auth.uid() = customer_id);
CREATE POLICY "Allow customer cancel own upcoming reservations" ON public.reservations FOR UPDATE USING (auth.uid() = customer_id AND reservation_date >= current_date AND status = 'confirmed') WITH CHECK (auth.uid() = customer_id AND status = 'cancelled');
CREATE POLICY "Allow owner/staff view reservations for their bar" ON public.reservations FOR SELECT USING (EXISTS (SELECT 1 FROM public.bars b WHERE b.id = reservations.bar_id AND b.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = reservations.bar_id AND sa.staff_user_id = auth.uid()));
CREATE POLICY "Allow owner/staff manage reservations for their bar" ON public.reservations FOR UPDATE USING (EXISTS (SELECT 1 FROM public.bars b WHERE b.id = reservations.bar_id AND b.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = reservations.bar_id AND sa.staff_user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.bars b WHERE b.id = reservations.bar_id AND b.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.staff_assignments sa WHERE sa.bar_id = reservations.bar_id AND sa.staff_user_id = auth.uid()));
-- Add DELETE policy if needed

-- Reservation Drinks RLS
ALTER TABLE public.reservation_drinks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow customer view own reservation drinks" ON public.reservation_drinks;
DROP POLICY IF EXISTS "Allow owner/staff view reservation drinks for their bar" ON public.reservation_drinks;
DROP POLICY IF EXISTS "Disallow direct modification of reservation drinks" ON public.reservation_drinks; -- Remove this if direct modification is needed
CREATE POLICY "Allow customer view own reservation drinks" ON public.reservation_drinks FOR SELECT USING (EXISTS (SELECT 1 FROM public.reservations r WHERE r.id = reservation_drinks.reservation_id AND r.customer_id = auth.uid()));
CREATE POLICY "Allow owner/staff view reservation drinks for their bar" ON public.reservation_drinks FOR SELECT USING (EXISTS (SELECT 1 FROM public.reservations r JOIN public.bars b ON r.bar_id = b.id WHERE r.id = reservation_drinks.reservation_id AND b.owner_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.reservations r JOIN public.staff_assignments sa ON r.bar_id = sa.bar_id WHERE r.id = reservation_drinks.reservation_id AND sa.staff_user_id = auth.uid()));
-- Add specific INSERT/UPDATE/DELETE policies if direct modification is allowed, otherwise rely on functions


-- == End of Schema ==