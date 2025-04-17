# Application Features - Bar Reservation System

## 1. Overview

This document outlines the features enabled by the Supabase database schema for the Bar Reservation mobile application. The features are categorized by user role (Customer, Staff, Owner) and include core functionalities as well as potential enhancements based on the data structure.

## 2. Core Concepts Supported

*   **Role-Based Access:** Distinct interfaces and permissions for Customers, Staff, and Owners.
*   **Multi-Bar Support:** The system can handle multiple bars, each with its own owner, schedule, menu, and reservations.
*   **Seat Type Reservations:** Users book categories (e.g., 'table'), not specific physical spots.
*   **Scheduling & Exceptions:** Manages regular weekly hours and specific date closures/special hours.
*   **Hold Policy:** Allows bars to define a time until which reservations are held before capacity might be released.
*   **Realtime Updates:** Key views (staff dashboard, booking availability) are designed to update live.
*   **Drink Pre-Selection:** Reservations can include associated drinks with prices captured at booking.

## 3. Customer Features (`role = 'customer'`)

*   **Authentication:**
    *   Sign Up / Register (via Supabase Auth)
    *   Log In / Sign In (via Supabase Auth)
    *   Password Reset / Forgot Password (via Supabase Auth)
*   **Bar Discovery & Viewing:**
    *   Browse a list or map of available (**live**) Bars.
    *   Search/Filter bars (e.g., by name, location - requires implementation).
    *   View detailed information for a specific Bar:
        *   Name, Address, Phone, Website, Description, Location on map.
        *   Regular Operating Hours (`operating_hours`).
        *   Upcoming Exceptions/Closures (`bar_exceptions`).
        *   Available Seat Types (`seat_options`).
        *   Drink Menu (`drink_options`).
        *   (Potentially) Photos, Reviews (Requires schema additions).
*   **Reservation Management:**
    *   **Create Reservation:**
        *   Select Bar.
        *   Select Date (UI should check against `bar_exceptions` and `operating_hours`, disabling closed dates).
        *   Select Seat Type (UI should show available types based on `seat_options`).
        *   Check Availability (UI displays if spots are available based on `reservations` count vs `seat_options.available_count`, potentially showing "X spots left").
        *   Receive Realtime updates if availability drops to zero while viewing.
        *   Select Party Size (UI validates against `seat_options.min_people`/`max_people`).
        *   *Optional:* Select Drinks (fetches available `drink_options`, captures `price_at_booking`).
        *   Add Special Requests (`reservations.special_requests`).
        *   Confirm Booking (triggers backend validation and insertion).
    *   **View Reservations:**
        *   See a list of their own upcoming `confirmed` reservations.
        *   See a list of their past reservations (`completed`, `no_show`, `cancelled`).
        *   View details of a specific reservation (Date, Bar, Seat Type, Party Size, Status, Special Requests, Drinks ordered).
    *   **Cancel Reservation:**
        *   Ability to cancel their own *upcoming* `confirmed` reservations (updates `reservations.status` to `cancelled`).
*   **Profile Management:**
    *   View their own profile details (`profiles.name`, `profiles.email`).
    *   Edit their own profile details (e.g., `name`).

## 4. Staff Features (`role = 'staff'`)

*   **Authentication:**
    *   Log In / Sign In (via Supabase Auth).
*   **Reservation Dashboard (Assigned Bar):**
    *   View a list of reservations **only for the bar(s) they are assigned to** via `staff_assignments`.
    *   Filter view primarily for the **current date** (`reservations.reservation_date = CURRENT_DATE`).
    *   List displays key reservation info (Customer Name, Party Size, Seat Type, Time (implied whole night), Special Requests, Drinks).
    *   **Realtime Updates:** The reservation list updates automatically (new bookings appear, cancellations are reflected, check-ins update status).
*   **Reservation Management (Assigned Bar - Current Day):**
    *   **View Dynamic Status:** See the calculated status for each reservation based on `reservations.status`, `reservations.checked_in_at`, and `bars.reservation_hold_until` (e.g., "Confirmed", "Arrived", "Hold Expired").
    *   **Check-In Guest:** Mark a reservation as arrived by setting `reservations.checked_in_at` when the guest arrives.
    *   View reservation details (as Customer, but for any reservation at their bar).
*   **Operational Awareness:**
    *   Use the dashboard to understand expected arrivals and manage seating/walk-ins based on confirmed reservations and the "Hold Expired" status.

## 5. Owner Features (`role = 'owner'`)

*   **Authentication:**
    *   Log In / Sign In (via Supabase Auth).
*   **Includes ALL Staff Features** for the bars they own.
*   **Bar Management (CRUD - Own Bars):**
    *   Create new Bars associated with their `profile.id`.
    *   View/Edit details for their own Bars (`name`, `address`, `phone`, `website`, `description`, `location`).
    *   Set/Update the `reservation_hold_until` time policy for their bar.
    *   Set/Update the `live` status to publish/unpublish their bar.
    *   (Potentially) Upload/Manage Bar Photos (Requires schema additions for image storage/references).
    *   Delete their own Bars (cascades to related data like hours, reservations etc. - use with caution).
*   **Schedule Management (CRUD - Own Bars):**
    *   Define/Update the regular weekly schedule in `operating_hours`.
    *   Create/Update/Delete specific date overrides in `bar_exceptions` (holidays, closures, special hours).
*   **Menu & Seating Management (CRUD - Own Bars):**
    *   Define/Update `seat_options` (add types, set `available_count`, `min/max_people`, `enable/disable`).
    *   Define/Update `drink_options` (add/edit drinks, set `price`).
*   **Staff Management (Own Bars):**
    *   View a list of staff assigned to their bar(s).
    *   Assign existing Customers as Staff for their bar (calls `promote_to_staff` function).
    *   Remove Staff assignments for their bar (calls `demote_staff` function).
*   **Reservation Oversight (Own Bars):**
    *   View *all* reservations (upcoming, past, cancelled) for their bar(s).
    *   Filter reservations by date range, status etc.
*   **End-of-Night Processing (Own Bars):**
    *   Access an interface to review past (`reservation_date < CURRENT_DATE`) `confirmed` reservations.
    *   Manually update status to `completed` (if `checked_in_at` is set) or `no_show` (if `checked_in_at` is NULL).
*   **(Potential) Analytics & Reporting (Own Bars):**
    *   View dashboards/reports on reservation volume, peak times, no-show rates, popular seat types, popular drinks (Requires querying and aggregating data).

## 6. General & Cross-Cutting Features

*   **Notifications (Requires Implementation):**
    *   Push/In-App notifications for reservation confirmation, upcoming reservation reminders, cancellation confirmations.
*   **UI/UX:**
    *   Intuitive navigation for each user role.
    *   Clear display of availability, times, prices.
    *   User-friendly date pickers, forms, and error messages.
*   **Security:**
    *   Leverages Supabase Auth and comprehensive Row Level Security (RLS) policies.
*   **Mapping Integration:**
    *   Displaying bar locations using the `geography` type.

## 7. Potential Future Features (Beyond Current Schema)

*   **Reservation Deposits/Payments:** Requires integration with a payment provider and schema additions.
*   **Waitlist System:** For when desired slots/types are full.
*   **Messaging:** Communication between customers and bars.
*   **Reviews & Ratings:** For bars.
*   **Photos:** Uploading bar/drink photos.
*   **Advanced Analytics:** More detailed reporting dashboards for owners.
*   **Promotions/Deals:** Special offers linked to reservations.
*   **Guest Management:** Allow customers to invite guests to their reservation.