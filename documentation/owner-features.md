Actor: User with role = 'owner' in profiles table.

Tech Stack Context: React/Next.js frontend using Zod for schema validation and TanStack (Query, Table, potentially Form) for data management and UI interactions. Supabase (or similar) backend exposing API endpoints for these database operations.

Authorization Context: All actions performed after selecting a bar (drinks.tsx, edit.tsx, reservations.tsx, staff.tsx) are implicitly constrained to the selected bar_id, and the backend must verify the Owner's ownership of that bar_id.

Phase 1: Before Selecting a Specific Bar

admin-panel.tsx (Owner's Dashboard / Bar Selection) -- ALREADY DONE

Purpose: Provide an overview for the owner and allow selection of a specific bar to manage.

Features:

Action: Read Owner's Bar Records

Entities: bars

Operation: Select (Row) filtered by owner_id.

Frontend: Use useQuery (TanStack Query) to fetch the list of bars where owner_id matches the logged-in owner's ID.

Display: List the fetched bars (name, address maybe). Could use TanStack Table if many bars are expected.

Interaction: Each listed bar should be selectable (e.g., clicking navigates to a bar-specific section, potentially passing the bar_id).

Action: Navigate to Create Bar Page

Frontend: Provide a clear button/link ("Create New Bar") that navigates the user to the create-bar.tsx route.

(Optional: Display User Information - Depending on requirements, could show a summary of users, maybe filtered by staff status across owned bars, requiring more complex queries.)

create-bar.tsx (New Bar Creation Form) -- ALREADY DONE

Purpose: Allow the owner to add a new bar to the system.

Features:

Action: Create Bar Record (Initial Required Info)

Entity: bars

Operation: Insert

Input (Form Fields): address, location (needs appropriate UI input, e.g., map selection or structured address fields), name.

Input (Implicit): owner_id (derived from the logged-in user's session).

Frontend Validation: Use a Zod schema to validate the required fields (address, location, name) before submission. TanStack Form could integrate with Zod.

Frontend Mutation: Use useMutation (TanStack Query) to handle the API call for inserting the bar record. Manage loading states and display success/error feedback.

On Success: Typically navigate the user to the admin-panel.tsx or directly to the edit.tsx page for the newly created bar.

Phase 2: After Selecting a Specific Bar (Context: bar_id)

drinks.tsx (Manage Selected Bar's Drinks) -- ALREADY DONE

Purpose: Manage the drink menu (especially pre-order options) for the currently selected bar.

Features:

Action: Read Drink Option Records

Entity: drink_options

Operation: Select (Row) filtered by the contextual bar_id.

Frontend: Use useQuery keyed by the bar_id to fetch and display the list of drinks. TanStack Table is suitable here.

Action: Create Drink Option Record

Entity: drink_options

Operation: Insert

Input (Form): price (number), type (Enum: drink_option_type), Optional: name (string | null).

Input (Implicit): bar_id (from context).

Frontend Validation: Zod schema for the drink form.

Frontend Mutation: useMutation to add the new drink, invalidating the drinks list query on success to refetch.

Action: Update Drink Option Record

Entity: drink_options

Operation: Update

Input (Form): id (drink option ID), Subset of drink_options.Update fields (e.g., price, type, name).

Input (Implicit): bar_id (for authorization check).

Frontend Validation: Zod schema for the update form.

Frontend Mutation: useMutation to update, invalidating the list query on success. Triggered from an "Edit" action on a specific drink in the list.

Action: Delete Drink Option Record

Entity: drink_options

Operation: Delete

Input: id (drink option ID).

Input (Implicit): bar_id (for authorization check).

Frontend Mutation: useMutation to delete, invalidating the list query on success. Triggered from a "Delete" action.


edit.tsx (Manage Selected Bar's Information)

Purpose: Edit the core details, operating hours, exceptions, and seating for the selected bar.

Features: (Multiple sections likely on this page)

Action: Read Bar Record (for editing)

Entity: bars

Operation: Select (Row) for the specific bar_id.

Frontend: useQuery to fetch the bar's current details.

Action: Update Bar Record

Entity: bars

Operation: Update

Input (Form): Subset of bars.Update fields (e.g., name, address, description, phone, website, live, reservation_hold_until).

Input (Implicit): bar_id.

Frontend Validation: Zod schema for the bar details form.

Frontend Mutation: useMutation to update bar details, invalidating the bar query on success.

Actions: Read/Create/Update/Delete Operating Hours Records (as described previously, but within this page's context)

Entities: operating_hours

Fields: day_of_week, open_time, close_time, closes_next_day.

Frontend: useQuery for list, useMutation for CUD operations, Zod for forms. Invalidate query on mutations.

Actions: Read/Create/Update/Delete Bar Exception Records (as described previously)

Entities: bar_exceptions

Fields: exception_date, is_closed, open_time, close_time, closes_next_day.

Frontend: useQuery for list, useMutation for CUD operations, Zod for forms. Invalidate query on mutations.

Actions: Read/Create/Update/Delete Seat Option Records (as described previously)

Entities: seat_options

Fields: type, available_count, min_people, max_people, enabled.

Frontend: useQuery for list, useMutation for CUD operations, Zod for forms. Invalidate query on mutations.

reservations.tsx (Manage Selected Bar's Reservations)

Purpose: View, manage status, and manually create reservations for the selected bar.

Features:

Action: Read Reservation Records

Entity: reservations (potentially joined with profiles on customer_id)

Operation: Select (Row) filtered by bar_id, likely with date filters.

Frontend: useQuery (key includes bar_id and filters) to fetch reservations. TanStack Table highly recommended.

Action: Read Reservation Drinks Records (on demand)

Entity: reservation_drinks

Operation: Select (Row) filtered by reservation_id.

Frontend: Triggered when viewing reservation details. Could be another useQuery or part of the initial reservation query if payload isn't too large.

Action: Update Reservation Record Status/Details

Entity: reservations

Operation: Update (e.g., changing status, setting checked_in_at).

Input: id (reservation ID), fields to update (subset of reservations.Update).

Input (Implicit): bar_id.

Frontend Mutation: useMutation triggered by actions (e.g., "Check In" button), invalidating the reservations list query on success.

Action: Create Reservation Record (Manual/Admin Entry)

Entity: reservations

Operation: Insert

Input (Form): customer_id (needs user search/selection UI), party_size, reservation_date, seat_type (Enum: seat_option_type, needs dropdown populated via seat_options query for this bar), Optional: special_requests, status (Enum: reservation_status).

Input (Implicit): bar_id.

Frontend Validation: Zod schema for the manual reservation form.

Frontend Mutation: useMutation to create, invalidating the reservations list query on success.

staff.tsx (Manage Selected Bar's Staff)

Purpose: Assign/unassign users as staff for the selected bar and manage their roles.

Features:

Action: Read Assigned Staff Members

Entity: staff_assignments (joined with profiles on staff_user_id)

Operation: Select (Row) filtered by bar_id.

Frontend: useQuery (keyed by bar_id) to fetch the list of assigned staff. TanStack Table suitable for display.

Action: Assign Staff Member

Entity: staff_assignments

Operation: Insert

Input (UI): Requires searching/selecting an existing user (target_user_id from profiles which becomes staff_user_id in the insert payload).

Input (Implicit): bar_id, assigned_by_owner_id (Owner's ID).

Frontend: May need a separate useQuery for user search. useMutation to create the staff_assignments record, invalidating the staff list query on success.

Action: Remove Staff Assignment

Entity: staff_assignments

Operation: Delete

Input: id (staff assignment ID).

Input (Implicit): bar_id.

Frontend Mutation: useMutation to delete, invalidating the staff list query on success.

Action: Promote User to Staff Role (Function Call)

Entity: profiles, staff_assignments (via DB function promote_to_staff)

Operation: Call promote_to_staff function.

Input: target_user_id (string), assigned_bar_id (string, bar_id from context).

Frontend Mutation: useMutation to call the function endpoint. May need to invalidate both staff list and potentially user list queries.

Action: Demote Staff Member (Function Call)

Entity: profiles, staff_assignments (via DB function demote_staff)

Operation: Call demote_staff function.

Input: target_user_id (string), bar_id (string, from context).

Frontend Mutation: useMutation to call the function endpoint. Invalidate relevant queries on success.

--- END OF FILE owner-features.md ---