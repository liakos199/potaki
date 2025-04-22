System Documentation: Bar Availability Calendar - DateSelection.tsx file - 


## THIS IS ALREADY IMPLEMENTED

1. Overview & Goal

This system provides an interactive calendar interface within the application, allowing logged-in users to view the availability of a specific bar for booking or informational purposes. It accurately reflects the bar's opening status and general seat availability for dates within the next month (from the current date). The system considers the bar's regular weekly schedule, specific date-based exceptions (holidays, special events), enabled seat types, and existing confirmed reservations.

Users are immediately shown which dates are closed or already fully booked across all seat types. When a user selects an available date, the system displays its specific opening/closing times and lists which types of seats still have availability.

2. Data Model & Core Logic

Availability calculation relies on four primary database tables and a core priority rule:

operating_hours Table: Defines the bar's default weekly schedule (day_of_week_enum, open_time, close_time).

bar_exceptions Table: Stores overrides (exception_date, is_closed, open_time, close_time) to the default schedule. Takes priority over operating_hours.

seat_options Table: Defines the types of seats available (type), their total count (available_count), and whether they are active (enabled).

reservations Table: Records confirmed bookings (reservation_date, seat_type, status). Only reservations with status = 'confirmed' are considered for availability checks.

Core Logic Steps (per date):

Check bar_exceptions first. If an exception exists, use its is_closed status and times.

If no exception, check operating_hours. If hours exist for that day of the week, use its status and times.

If the date is determined to be isOpen:

Fetch the baseline capacity for all enabled seat_options.

Count confirmed reservations for that specific date, grouped by seat_type.

Calculate remaining seats for each enabled seat type.

Determine isFullyBooked: True if all enabled seat types have 0 or fewer remaining seats.

Determine availableSeatTypes: A list containing the type names of seat options that still have > 0 remaining seats.

3. Backend Implementation (Supabase Edge Function: get-bar-availability)

A secure, server-side Supabase Edge Function handles the consolidated availability calculation.

Technology: Deployed TypeScript function (Deno runtime).

Endpoint: GET /functions/v1/get-bar-availability/{barId}

Authentication: Requires JWT Authentication ("Enforce JWT Verification" enabled). Needs Authorization: Bearer <token>.

Inputs:

barId: UUID of the target bar (URL path).

start_date: Range start (query parameter, 'YYYY-MM-DD').

end_date: Range end (query parameter, 'YYYY-MM-DD').

Processing Steps:

Validate inputs.

Initialize Supabase client (SERVICE_ROLE_KEY).

Fetch Data Concurrently:

operating_hours (day, open, close) for barId.

bar_exceptions (date, is_closed, open, close) for barId within the date range.

seat_options (type, available_count) for barId where enabled = true.

reservations (date, seat_type) for barId, status = 'confirmed', within the date range.

Process Data: Organize fetched data into efficient lookup structures (Maps for hours, exceptions, baseline capacity, and grouped reservation counts per date/seat type).

Iterate Through Date Range: For each date from start_date to end_date:

Determine isOpen, isException, openTime, closeTime based on exceptions/hours logic.

If isOpen is true:

Calculate remaining seats for each enabled seat type by subtracting reservation counts from baseline capacity.

Determine isFullyBooked (true if all enabled types have <= 0 remaining).

Build the availableSeatTypes list (containing types with > 0 remaining).

If isOpen is false: Set isFullyBooked to true and availableSeatTypes to empty.

Store Result: Add an entry to the result map (dateStatusMap) for dates that are open or have an exception, including all calculated fields (isOpen, isException, openTime, closeTime, isFullyBooked, availableSeatTypes).

Output: Returns a JSON object:

{
  "dateStatus": {
    "YYYY-MM-DD": {
      "isOpen": boolean,
      "isException": boolean,
      "openTime": string | null,
      "closeTime": string | null,
      "isFullyBooked": boolean,      // True if no seats of any type are left
      "availableSeatTypes": string[] // List of types with >0 seats (e.g., ["table", "vip"])
    },
    // ... other dates with status
  }
}


4. Frontend Implementation (React Native Component: DateSelection.tsx)

Handles UI, user interaction, and displays data fetched from the backend.

Technology: React Native, date-fns, Supabase JS client, UI components.

Initialization & Data Fetching:

Calculates today and maxDate (today + 1 month).

Calls fetchAvailableDates on mount/barId change.

fetchAvailableDates performs authenticated fetch to the Edge Function endpoint, retrieving the dateStatus object.

Updates component state (dateStatusState, isLoading, error).

State Management: Uses useState for dateStatusState (now includes isFullyBooked, availableSeatTypes), isLoading, error, selectedDate.

Calendar Rendering & Interaction:

Renders a horizontal ScrollView of date tiles.

For each date tile:

Looks up its status (statusInfo) in dateStatusState.

Calculates isDisabled based on: !statusInfo || !statusInfo.isOpen || statusInfo.isFullyBooked || isBefore(date, today). Critically, isFullyBooked now contributes to disabling the tile.

Applies conditional styling for selection, disabled state, and exception days (border). Optionally adds a small visual cue (e.g., dot) if isOpen but isFullyBooked.

Attaches onPress to non-disabled tiles to update selectedDate.

Selected Date/Time/Availability Display:

Renders a summary section only when selectedDate has corresponding statusInfo.

Displays formatted date, adding "(Special Hours)" or "(Special Closure)" if isException is true.

Displays formatted openTime - closeTime if isOpen and times are available.

Displays Availability Status:

If !isOpen: Shows "Closed".

If isOpen and isFullyBooked: Shows "Fully Booked" (e.g., with a red X icon).

If isOpen and !isFullyBooked: Shows "Available: " followed by a comma-separated list of capitalized availableSeatTypes (e.g., "Available: Table, Vip") (e.g., with a green check icon).

5. User Experience Summary

User views the calendar. Loading occurs.

Calendar displays dates for the next month.

Dates that are closed OR have no remaining seats of any type are immediately disabled and visually distinct.

Dates with special hours/closures (exceptions) retain their visual indicator (e.g., border).

User taps an available (non-disabled) date tile.

Tile becomes selected.

Summary section updates showing:

Formatted Date (with exception note if applicable).

Open/Close Times.

Availability Status: "Available: Table, Vip" (listing types with >0 seats).

The parent component (new.tsx) receives the selectedDate, knowing it's open and has some seat availability (though specific type/count check happens later).

This refined approach provides clear, immediate feedback on date-level availability, including whether a date is completely booked, using a single efficient API call for the calendar view.