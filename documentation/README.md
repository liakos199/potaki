# Bar Reservation System - Supabase Database Schema

## 1. Overview

This document describes the PostgreSQL database schema for a mobile bar reservation application built using Supabase. The system manages bars, users with different roles (customer, staff, owner), bar operating schedules (including exceptions), seat types, drink menus, reservations, and staff assignments.

Key features supported by this schema include:

*   **Role-Based Access:** Different user roles have distinct permissions enforced by RLS.
*   **Bar Management:** Owners can define bar details, operating hours, exceptions, seat types, and menus.
*   **Scheduling:** Handles regular weekly hours and specific date overrides (closures/special hours).
*   **Seat Type Reservations:** Users reserve a *type* of seat (e.g., 'table', 'vip') for a whole night, not a specific physical table.
*   **Availability Checks:** Verifies bar opening status and seat type availability before booking.
*   **Drink Orders:** Allows associating specific drinks (with price captured at booking) with a reservation.
*   **Hold Policy & Check-in:** Supports a "hold until" time for reservations and manual staff check-in.
*   **Concurrency Handling:** Designed with Realtime in mind to provide UI feedback during booking races.
*   **Staff Management:** Owners can assign/remove staff roles for their bars.

## 2. Technology

*   **Database:** PostgreSQL (managed by Supabase)
*   **Extensions:** `uuid-ossp`, `postgis`
*   **Backend:** Supabase (Auth, Database, Realtime, Functions)

## 3. Core Concepts

*   **Seat Type Booking:** Users book a general category like 'table' or 'vip'. The `seat_options` table defines the *total count* of physical spots available for that type at a bar. Staff assign specific physical tables upon arrival.
*   **Whole Night Reservation:** A reservation is made for a specific `reservation_date` and covers the entire period the bar is open on that date.
*   **Effective Operating Hours:** Determined by first checking the `bar_exceptions` table for the specific date. If no exception exists, the `operating_hours` table (based on the day of the week) is used.
*   **Hold Policy:** The `bars.reservation_hold_until` time defines when staff are no longer obligated to hold capacity for a `confirmed` reservation if the guest hasn't `checked_in_at`. This is a soft policy; staff can still check the guest in later if capacity permits.
*   **Dynamic Display Status:** The status shown to staff for a current reservation ("Confirmed", "Arrived", "Hold Expired") is calculated dynamically based on `reservations.status`, `reservations.checked_in_at`, `bars.reservation_hold_until`, and the current time. It doesn't automatically change the stored `reservations.status`.
*   **Price At Booking:** The price for drinks associated with a reservation is captured in `reservation_drinks.price_at_booking` when the item is added, ensuring historical price accuracy even if menu prices change later.
*   **ON DELETE SET NULL:** Used for `reservation_drinks.drink_option_id`. If a drink is deleted from the menu (`drink_options`), the link in past reservations becomes NULL, preserving the quantity and price paid but losing the specific drink name/type association for that historical record.

## 4. Schema Breakdown

### 4.1. `public.profiles`
*   **Purpose:** Stores user data, linked 1:1 with `auth.users`. Manages user roles.
*   **Key Columns:**
    *   `id` (PK, FK to `auth.users.id`): User's unique ID.
    *   `role`: 'customer', 'staff', 'owner'. Determines permissions via RLS.
    *   `email`, `name`: Basic profile info.
    *   `created_at`, `updated_at`: Timestamps.
*   **Related:** `handle_new_user` function/trigger populates this on new auth sign-up. RLS restricts access based on user ID and role.

### 4.2. `public.bars`
*   **Purpose:** Central table storing information about each bar establishment.
*   **Key Columns:**
    *   `id` (PK): Unique bar identifier.
    *   `owner_id` (FK to `profiles.id`): Links to the profile of the bar's owner.
    *   `name`, `address`, `phone`, `website`, `description`: Bar details.
    *   `location` (`geography(Point, 4326)`): Physical location for mapping.
    *   `reservation_hold_until` (`TIME`): Optional cut-off time for holding reservations.
    *   `live` (`boolean`): Flag indicating if the bar is publicly visible/active.
    *   `created_at`, `updated_at`: Timestamps.
*   **Related:** RLS restricts management actions to the `owner_id`. Linked to by many other tables (`operating_hours`, `reservations`, etc.).

### 4.3. `public.operating_hours`
*   **Purpose:** Defines the *regular* weekly opening and closing times for each bar.
*   **Key Columns:**
    *   `id` (PK).
    *   `bar_id` (FK to `bars.id`): The associated bar.
    *   `day_of_week` (`day_of_week_enum`): 1 (Mon) to 7 (Sun).
    *   `open_time`, `close_time` (`TIME`): Local opening/closing times.
    *   `closes_next_day` (`boolean`): True if `close_time` falls on the calendar day after `open_time`.
*   **Related:** `UNIQUE(bar_id, day_of_week)`. Read by reservation logic if no exception exists for the date. RLS allows owners/staff to manage.

### 4.4. `public.bar_exceptions`
*   **Purpose:** Stores specific date overrides to the regular schedule (holidays, closures, special hours). Takes precedence over `operating_hours`.
*   **Key Columns:**
    *   `id` (PK).
    *   `bar_id` (FK to `bars.id`).
    *   `exception_date` (`date`): The specific date this exception applies to.
    *   `is_closed` (`boolean`): If true, the bar is fully closed this date.
    *   `open_time`, `close_time`, `closes_next_day`: *Must* be set if `is_closed` is false, defining the special hours for this date only.
    *   `reason` (`text`): Optional explanation.
    *   `created_at`, `updated_at`: Timestamps.
*   **Related:** `UNIQUE(bar_id, exception_date)`. Checked *first* by reservation logic. RLS allows owners/staff to manage.

### 4.5. `public.seat_options`
*   **Purpose:** Defines the *types* of bookable seats available at a bar and their total capacity.
*   **Key Columns:**
    *   `id` (PK).
    *   `bar_id` (FK to `bars.id`): Must be associated with a bar.
    *   `type` (`seat_option_type`): 'bar', 'table', 'vip'.
    *   `enabled` (`boolean`): Whether this type can currently be booked.
    *   `available_count` (`integer`): Total number of physical spots of this type. Used for availability check.
    *   `min_people`, `max_people` (`integer`): Party size limits for this seat type.
*   **Related:** `UNIQUE(bar_id, type)`. Referenced by `reservations.seat_option_id`.

### 4.6. `public.drink_options`
*   **Purpose:** Defines the menu items (drinks) available for purchase/reservation at a specific bar.
*   **Key Columns:**
    *   `id` (PK).
    *   `bar_id` (FK to `bars.id`).
    *   `type` (`drink_option_type`): 'single-drink', 'bottle'.
    *   `name` (`text`): Name of the drink (esp. for bottles).
    *   `price` (`numeric`): Current price of the drink.
    *   `created_at`, `updated_at`: Timestamps.
*   **Related:** Referenced by `reservation_drinks.drink_option_id`. RLS allows owners/staff to manage.

### 4.7. `public.staff_assignments`
*   **Purpose:** Junction table linking staff `profiles` to the `bars` they work at.
*   **Key Columns:**
    *   `id` (PK).
    *   `staff_user_id` (FK to `profiles.id`): The staff member.
    *   `bar_id` (FK to `bars.id`): The bar they are assigned to.
    *   `assigned_by_owner_id` (FK to `profiles.id`): The owner who made the assignment.
*   **Related:** `UNIQUE(staff_user_id, bar_id)`. Used by RLS policies to grant staff permissions for specific bars. Managed via `promote_to_staff` and `demote_staff` functions.

### 4.8. `public.reservations`
*   **Purpose:** Core table storing individual reservation bookings.
*   **Key Columns:**
    *   `id` (PK).
    *   `customer_id` (FK to `profiles.id`): The user who made the booking. `ON DELETE SET NULL` preserves reservation history if user is deleted.
    *   `bar_id` (FK to `bars.id`).
    *   `seat_option_id` (FK to `seat_options.id`): Links to the *type* of seat booked. `ON DELETE RESTRICT` prevents deleting a seat type if reservations exist for it.
    *   `reservation_date` (`date`): The specific date the booking is for.
    *   `party_size` (`smallint`).
    *   `status` (`reservation_status`): 'confirmed', 'cancelled', 'completed', 'no_show'. Default 'confirmed'.
    *   `special_requests` (`text`).
    *   `checked_in_at` (`timestamptz`): NULL until staff marks the guest as arrived. Key for hold policy logic.
    *   `created_at`, `updated_at`: Timestamps.
*   **Related:** Central transactional table. Links users, bars, seat types. Associated drinks stored in `reservation_drinks`. Triggers enforce data integrity (`check_reservation_seat_option_bar_match`) and update timestamps. RLS grants access based on customer or staff/owner relationship to the bar. Realtime enabled.

### 4.9. `public.reservation_drinks`
*   **Purpose:** Junction table linking reservations to the specific drinks ordered as part of that booking.
*   **Key Columns:**
    *   `id` (PK): Line item ID.
    *   `reservation_id` (FK to `reservations.id`).
    *   `drink_option_id` (FK to `drink_options.id`): The specific drink item. `ON DELETE SET NULL` means this becomes NULL if the drink is deleted from the menu, preserving the rest of the line item data.
    *   `quantity` (`smallint`).
    *   `price_at_booking` (`numeric`): **Crucial** - price per unit *when booked*.
*   **Related:** Trigger (`check_reservation_drink_bar_match`) ensures drink belongs to the reservation's bar. Used to calculate total reservation price dynamically (`SUM(quantity * price_at_booking)`).

## 5. Relationships Summary

*   `auth.users` -> `profiles` (1:1)
*   `profiles` -> `bars` (Owner relationship, 1:N)
*   `profiles` -> `staff_assignments` <- `bars` (Staff relationship, M:N)
*   `bars` -> `operating_hours` (1:N, one per day of week)
*   `bars` -> `bar_exceptions` (1:N, zero or one per date)
*   `bars` -> `seat_options` (1:N, one per seat type)
*   `bars` -> `drink_options` (1:N)
*   `reservations` -> `profiles` (Customer relationship, N:1)
*   `reservations` -> `bars` (N:1)
*   `reservations` -> `seat_options` (N:1, Reservation for a Seat Type)
*   `reservations` -> `reservation_drinks` <- `drink_options` (Reservation drinks M:N via junction, handling deleted drinks via SET NULL)

## 6. Key Workflows & Logic

*   **User Registration:** `auth.users` INSERT triggers `handle_new_user` to create `profiles` row.
*   **Reservation Booking:**
    1.  Check `bar_exceptions` for the selected date/bar. If closed, stop. If open special hours, note them.
    2.  If no exception, check `operating_hours` for the date/bar. If closed, stop. If open, note regular hours.
    3.  Check `seat_options` availability (`available_count` vs `COUNT(*)` from `reservations` for that `seat_option_id` and `date`).
    4.  Perform checks within a database transaction for atomicity.
    5.  Insert into `reservations`.
    6.  Insert selected items into `reservation_drinks`, capturing `price_at_booking`.
*   **Staff Check-in:** Staff action updates `reservations.checked_in_at` for a specific reservation ID.
*   **Hold Policy Evaluation (Staff UI):** Dynamically determine if `current_time > bars.reservation_hold_until` AND `reservations.checked_in_at IS NULL` for confirmed reservations on the current date.
*   **End-of-Night Status Update:** Manual process where staff/owner update `reservations.status` to 'completed' or 'no_show' based on whether `checked_in_at` has a value for past reservations.
*   **Staff Management:** `promote_to_staff` and `demote_staff` functions handle role changes and `staff_assignments` entries.

## 7. Important Mechanisms

*   **Triggers:**
    *   `handle_new_user`: Links Auth to Profiles.
    *   `update_updated_at_column`: Maintains `updated_at` fields automatically.
    *   `check_reservation_seat_option_bar_match`: Ensures data integrity between reservation's bar and seat option's bar.
    *   `check_reservation_drink_bar_match`: Ensures data integrity between reservation's bar and drink's bar.
*   **Functions:**
    *   `promote_to_staff`, `demote_staff`: Encapsulate logic for secure staff management.
    *   Data validation functions (used by triggers).
*   **RLS (Row Level Security):** Enforces data access rules based on user roles (`profiles.role`) and relationships (e.g., `bars.owner_id`, `staff_assignments`, `reservations.customer_id`). Essential for security.
*   **Realtime:** Expected to be enabled on `reservations`, `bar_exceptions`, potentially `operating_hours` and `reservation_drinks` to provide live updates to the frontend application, especially for staff views and handling booking concurrency.

## 8. Conclusion

This schema provides a robust foundation for the bar reservation application, handling complex scheduling, different user roles, and transactional data like reservations and associated drink orders. Key considerations during implementation include careful handling of database transactions for booking, correct implementation of RLS policies, and effective use of Supabase Realtime for a responsive user experience.