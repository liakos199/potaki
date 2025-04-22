Okay, here is the updated seats-logic.md documentation reflecting the final implementation for Step 2 (Seat Selection), incorporating the changes where all base seat types are displayed but disabled/styled based on fetched availability and party size constraints.

seats-logic.md (Updated)

System Documentation: Bar Reservation Flow - Step 2: Seat Selection

1. Overview & Goal

This document outlines the logic and implementation for the "Select Seat" step within the multi-step bar reservation process. This step follows the "Select Date" step. Its goal is to allow the logged-in user to choose a specific type of seating (bar, table, vip) for their previously selected date, based on real-time availability and party size constraints.

2. Information Available from Previous Step (Date Selection)

barId: The unique identifier of the bar.

selectedDate: The specific date chosen by the user (a Date object, typically start-of-day).

partySize: The number of guests in the user's party (a number, potentially selected before or during this step).

The selectedDate is known to be isOpen and not isFullyBooked overall (checked in Step 1).

3. Design Approach: On-Demand Detailed Fetch

To ensure accuracy without overloading the initial calendar load, this step fetches detailed seat availability specifically for the selected date when the user enters this step.

Rationale: Avoids fetching potentially large amounts of seat count data for all dates in the calendar view. Focuses computation and data transfer on the exact information needed at this point in the flow. Provides up-to-date counts reflecting reservations made since the initial calendar data was fetched.

4. Backend Implementation (Supabase Edge Function: get-seats-for-date)

A dedicated, secure Edge Function retrieves the necessary seat details.

Function Goal: Return detailed information (remaining count, min/max people) for all enabled seat types for the bar on the specified target date, considering current confirmed reservations.

Technology: Supabase Edge Function (TypeScript/Deno).

Endpoint: GET /functions/v1/get-seats-for-date/{barId}

Authentication: Requires JWT Authentication ("Enforce JWT Verification" enabled).

Inputs:

barId: UUID of the bar (URL path).

target_date: Specific date selected by the user (Query parameter, format 'YYYY-MM-DD').

Processing Steps:

Validate inputs (barId, target_date).

Initialize Supabase client (SERVICE_ROLE_KEY).

Fetch Data Concurrently:

Fetch all seat_options for barId where enabled = true (select type, available_count, min_people, max_people).

Fetch reservations for the exact barId and target_date where status = 'confirmed' (select seat_type for counting).

Process Results:

Count the number of confirmed reservations for each seat_type on the target_date.

Iterate through the fetched enabled seat_options.

For each enabled option, calculate remainingCount = available_count - reserved_count. Ensure remainingCount is not negative.

Construct a SeatDetails object ({ type, remainingCount, minPeople, maxPeople }) for each enabled type.

Return the list of these SeatDetails objects.

Output: JSON object containing an array (seatDetails) with details only for seat types that are enabled for the bar. The array might include types with remainingCount: 0.

{
  "seatDetails": [
    { "type": "table", "remainingCount": 5, "minPeople": 2, "maxPeople": 4 },
    { "type": "vip", "remainingCount": 0, "minPeople": 4, "maxPeople": 8 }, // Still returned if enabled
    // 'bar' type omitted if it was disabled in the seat_options table for this bar
  ]
}


Deployment: This function is deployed and accessible via its endpoint URL.

5. Frontend Implementation (React Native Component: SeatSelection.tsx)

This component renders the UI for selecting a seat type.

Component: SeatSelection.tsx

Props: Receives barId, selectedDate, partySize, selectedSeatType (current selection state), and onSeatTypeChange (callback) from the parent (NewReservationScreen.tsx).

State: Manages seatDetailsState (stores the array fetched from the API, SeatDetails[] | null), isLoading, error.

Data Fetching (useEffect):

Triggered when barId or selectedDate changes.

Clears previous seat details and selection. Sets isLoading true.

Calls the get-seats-for-date Edge Function using an authenticated fetch request, passing the barId and formatted target_date.

On success, updates seatDetailsState with the fetched seatDetails array.

Handles loading and error states.

Rendering:

Displays Loading/Error states appropriately.

Always iterates through a predefined list of all potential seat types (allSeatOptionsConfig containing 'table', 'bar', 'vip').

For each potential type (baseOption):

Finds the corresponding data (detail) from the fetched seatDetailsState (if it exists).

Determines if the type is offered (isOfferedByBar = !!detail).

Determines if the current partySize fits the minPeople/maxPeople range (only if isOfferedByBar).

Determines if seats are left (hasSeatsLeft = detail?.remainingCount > 0).

Calculates isDisabled based on: !isOfferedByBar || !hasSeatsLeft || !fitsPartySize.

Renders a Pressable card for each baseOption:

Applies styling based on isSelected and isDisabled (e.g., background, opacity, border).

Displays the seat type label and icon.

Conditionally displays status/details:

If !isOfferedByBar: Shows "Not Offered".

If offered but !hasSeatsLeft: Shows "Fully Booked".

If offered, has seats, but !fitsPartySize: Shows "Fits X-Y" (warning state).

If offered, has seats, and fits party size: Shows "X Seats Left".

Also displays the minPeople-maxPeople range if the type is offered by the bar.

Sets the disabled prop on the Pressable based on the isDisabled calculation.

Calls onSeatTypeChange(baseOption.type) when a non-disabled option is pressed.

6. Integration with Parent (NewReservationScreen.tsx)

The parent component manages the overall flow (currentStep).

When currentStep becomes ReservationStep.SEAT_TYPE, it renders SeatSelection.tsx.

It passes the fetched availableSeatDetails (the SeatDetails[]) state, isLoading, error, selectedSeatType state, the current partySize state, and the setSelectedSeatType state setter function (as onSeatTypeChange) down as props.

When onSeatTypeChange is called by the child, the parent updates its selectedSeatType state.

The parent handles navigation to the next step (PartySizeSelection or Drinks depending on flow) when the "Continue" button is pressed, potentially re-validating the party size against the selected seat type's min/max limits before proceeding.

7. User Experience Summary

User selects an available date (known not to be fully booked overall).

Navigation proceeds to the "Select Seat" view.

Brief loading indicator shown while seat details for that date are fetched.

A list of all standard seat types (Table, Bar, VIP) is displayed.

For each type:

If offered by the bar and available for the party size: Shows remaining seats and capacity (e.g., "5 Seats Left | Seats 2-4"). Enables interaction.

If offered but full: Shows "Fully Booked". Disables interaction.

If offered but doesn't fit party size: Shows "Fits X-Y" (warning). Disables interaction.

If not offered by the bar: Shows "Not Offered". Disables interaction.

User taps an enabled seat type option.

Option becomes visually selected.

User proceeds to the next step.

This design ensures users see all potential options but can only select valid, available ones based on real-time counts and party size constraints for their chosen date.


//// EDGE FUNCTION /////
// supabase/functions/get-seats-for-date/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// --- Main Function Logic ---
serve(async (req)=>{
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // 1. --- Parse Request and Validate Input ---
    const url = new URL(req.url);
    // Extract barId from path: /functions/v1/get-seats-for-date/{barId}
    const pathParts = url.pathname.split('/');
    const barId = pathParts[pathParts.length - 1];
    // Get target_date from query parameter
    const targetDateString = url.searchParams.get('target_date');
    // Validate required parameters
    if (!barId || barId === 'get-seats-for-date') {
      return new Response(JSON.stringify({
        error: 'Missing or invalid barId in URL path'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    if (!targetDateString) {
      return new Response(JSON.stringify({
        error: 'Missing required query parameter: target_date'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // Basic date validation
    const targetDate = new Date(targetDateString + 'T00:00:00Z');
    if (isNaN(targetDate.getTime())) {
      return new Response(JSON.stringify({
        error: 'Invalid date format for target_date. Use YYYY-MM-DD.'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // 2. --- Initialize Supabase Client ---
    // Use Service Role Key for backend access
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // 3. --- Fetch Data Concurrently ---
    const [seatOptionsResult, reservationsResult] = await Promise.all([
      // Fetch Enabled Seat Options for the Bar
      supabaseClient.from('seat_options').select('type, available_count, min_people, max_people').eq('bar_id', barId).eq('enabled', true),
      // Fetch Confirmed Reservation Counts for the SPECIFIC DATE, grouped by seat_type
      // Note: Using a manual count aggregation after fetching relevant rows
      // Alternatively, create a DB function (RPC) for optimized counting if performance is critical.
      supabaseClient.from('reservations').select('seat_type') // Select only what's needed for counting
      .eq('bar_id', barId).eq('reservation_date', targetDateString) // Filter for the specific date
      .eq('status', 'confirmed') // Count only confirmed reservations
    ]);
    // 4. --- Check for Errors & Process Fetched Data ---
    if (seatOptionsResult.error) throw new Error(`DB error fetching seat options: ${seatOptionsResult.error.message}`);
    if (reservationsResult.error) throw new Error(`DB error fetching reservations: ${reservationsResult.error.message}`);
    // Count reservations per seat type for the target date
    const reservationCounts = new Map();
    (reservationsResult.data || []).forEach((res)=>{
      reservationCounts.set(res.seat_type, (reservationCounts.get(res.seat_type) || 0) + 1);
    });
    // 5. --- Calculate Remaining Seats and Prepare Response ---
    const seatDetailsResult = [];
    const enabledSeatOptions = seatOptionsResult.data || [];
    for (const option of enabledSeatOptions){
      const reservedCount = reservationCounts.get(option.type) || 0;
      const remainingCount = option.available_count - reservedCount;
      // Only include seat types that potentially have seats remaining
      // You could choose to include those with 0 remaining and let frontend disable them.
      // Let's include them here for completeness. Frontend will handle disabling.
      seatDetailsResult.push({
        type: option.type,
        remainingCount: remainingCount < 0 ? 0 : remainingCount,
        minPeople: option.min_people,
        maxPeople: option.max_people
      });
    }
    // 6. --- Return Successful Response ---
    // The response contains the array directly under a key
    const responseBody = {
      seatDetails: seatDetailsResult
    };
    return new Response(JSON.stringify(responseBody), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    // --- Handle Errors ---
    console.error('Edge Function Error [get-seats-for-date]:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'An unknown error occurred'
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
