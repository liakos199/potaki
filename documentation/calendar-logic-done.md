Okay, here is the final documentation explaining how the bar availability calendar system works, incorporating all the features you've implemented.

System Documentation: Bar Availability Calendar

1. Overview & Goal

This system provides an interactive calendar interface within the application, allowing logged-in users to view the availability of a specific bar for booking or informational purposes. It accurately reflects the bar's opening status for dates within the next month (from the current date), considering both its regular weekly schedule and any specific date-based exceptions (like holidays or special events). When a user selects an available date, the system displays the corresponding opening and closing times for that specific date.

2. Data Model & Core Logic

The availability calculation relies on two primary database tables and a core priority rule:

operating_hours Table: Stores the bar's default weekly schedule. Each entry defines a day_of_week_enum, open_time, and close_time when the bar is normally open.

bar_exceptions Table: Stores exceptions to the default schedule for specific calendar dates (exception_date). An entry can either mark the bar as explicitly closed (is_closed = true) or explicitly open (is_closed = false), potentially with unique open_time and close_time for that date only.

Priority Rule: Entries in the bar_exceptions table always override the operating_hours schedule for the corresponding date. If an exception exists for a date, its is_closed status and times (if applicable) dictate the bar's availability, regardless of the regular schedule.

3. Backend Implementation (Supabase Edge Function: get-bar-availability)

A secure, server-side Supabase Edge Function handles the core availability calculation to ensure data integrity and efficiency.

Technology: Deployed TypeScript function running on Deno within the Supabase infrastructure.

Endpoint: GET /functions/v1/get-bar-availability/{barId}

Authentication: Requires JWT Authentication. The function is configured with "Enforce JWT Verification" enabled. Requests must include a valid Authorization: Bearer <user_access_token> header from a logged-in application user. Supabase automatically validates the token before executing the function.

Inputs:

barId: The UUID of the target bar (passed in the URL path).

start_date: The first date of the range to check (query parameter, format 'YYYY-MM-DD').

end_date: The last date of the range to check (query parameter, format 'YYYY-MM-DD').

Processing Steps:

Receives and validates the input parameters (barId, start_date, end_date).

Initializes the Supabase client using the secure SERVICE_ROLE_KEY.

Fetches all regular operating_hours (including open_time, close_time) for the given barId and stores them efficiently (e.g., in a Map keyed by day_of_week_enum).

Fetches all bar_exceptions (including is_closed, open_time, close_time) for the barId that fall within the requested start_date and end_date range. Stores these efficiently (e.g., in a Map keyed by exception_date).

Iterates through each calendar date from start_date to end_date.

For each date:

Checks if an entry exists in the exceptionsMap.

If Exception Exists: Determines isOpen (opposite of is_closed), sets isException to true, and retrieves openTime/closeTime directly from the exception record (setting times to null if is_closed is true).

If No Exception Exists: Determines the day of the week, looks up the corresponding entry in the regularHoursMap.

If regular hours exist for that day: Sets isOpen to true, isException to false, and retrieves openTime/closeTime from the regular hours record.

If neither an exception nor regular hours exist for the date: The date is considered closed and is not added to the result map.

Constructs the final result map containing status and time details only for dates that are either regularly open or have an exception record.

Output: Returns a JSON object containing a single key dateStatus. The value of dateStatus is another object where keys are date strings ('YYYY-MM-DD') and values are objects detailing the status for that specific date:

{
  "dateStatus": {
    "YYYY-MM-DD": {
      "isOpen": boolean,      // True if the bar is open on this date
      "isException": boolean, // True if this date's status is due to an exception
      "openTime": string | null, // "HH:MM:SS" or null
      "closeTime": string | null // "HH:MM:SS" or null
    },
    // ... other dates
  }
}


4. Frontend Implementation (React Native Component: DateSelection.tsx)

The frontend component handles user interaction, calls the backend function, and renders the calendar UI.

Technology: React Native component using date-fns for date manipulation and a UI library for rendering (e.g., built-in components, potentially lucide-react-native for icons).

Initialization & Data Fetching:

Calculates the display range: today to maxDate (today + 1 month).

On mount (or when barId changes), calls an asynchronous function (fetchAvailableDates).

fetchAvailableDates uses the Supabase client (supabase.auth.getSession()) to get the logged-in user's access_token.

It constructs the Edge Function URL and makes a GET request using fetch, including the required Authorization: Bearer <token> header.

Parses the JSON response containing the dateStatus object.

Updates the component's state (dateStatusState) with the received data.

Handles loading states (isLoading) and potential errors (error).

State Management: Uses useState to manage dateStatusState (the object mapping dates to their status/times), isLoading, error, and the selectedDate passed via props.

Calendar Rendering & Interaction:

Displays a horizontal ScrollView containing interactive date tiles for the calculated display range (datesForDisplay).

For each date tile:

Determines its status (isOpen, isException, openTime, closeTime) by looking up the date string in dateStatusState.

Calculates if the tile should be isDisabled (if no status info exists, if isOpen is false, or if the date is before today).

Applies conditional styling:

Different background for the selectedDate.

Reduced opacity for isDisabled tiles.

A distinct border (e.g., yellow/red) for dates where isException is true and the tile is not disabled.

Attaches an onPress handler to non-disabled tiles, which calls the onDateChange prop function passed from the parent component, updating the selectedDate.

Selected Date/Time Display:

Below the calendar scroll view, a section displays information about the currently selectedDate.

This section only renders if a selectedDate is chosen AND its status (selectedStatusInfo) indicates isOpen is true.

It shows the formatted date (e.g., "Today", "Mon, Jul 22").

It includes an indicator like "(Special Hours)" if selectedStatusInfo.isException is true.

It formats the openTime and closeTime from selectedStatusInfo into a user-friendly format (e.g., "5:00 PM - 2:00 AM") using a helper function (formatTimeDisplay) and displays it next to a <Clock> icon.

5. User Experience Summary

User navigates to the screen containing the DateSelection component.

A loading indicator appears briefly while availability data is fetched.

A horizontal scrolling calendar displays dates for the next month.

Dates when the bar is closed (or outside the valid range) are visually disabled (e.g., greyed out).

Dates affected by special exceptions have a distinct visual indicator (e.g., a colored border).

User taps an available (non-disabled) date tile.

The tapped tile becomes visually selected (e.g., different background color).

A summary section below the calendar updates to show the selected date (formatted) and its specific opening and closing times. If it's an exception day, "(Special Hours)" is noted.

The parent component receives the selected date via the onDateChange callback for further use (e.g., making a reservation).


/////////

// supabase/functions/get-bar-availability/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// --- Date Helper (CRITICAL: ADJUST MAPPING TO YOUR ENUM) ---
// Ensure this function returns the correct type DayOfWeekEnum
function getDayOfWeekEnum(date) {
  const jsUTCDay = date.getUTCDay(); // 0=Sun, 1=Mon,... 6=Sat
  // Example: Assuming 1=Monday, 2=Tuesday, ..., 7=Sunday
  if (jsUTCDay === 0) {
    return '7';
  } else {
    return String(jsUTCDay);
  } // Cast is okay if mapping is guaranteed
}
// --- Main Function Logic (Should be fine now) ---
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // 1. --- Parse Request and Validate Input ---
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const barId = pathParts[pathParts.length - 1];
    const startDateString = url.searchParams.get('start_date');
    const endDateString = url.searchParams.get('end_date');
    if (!barId || barId === 'get-bar-availability' || !startDateString || !endDateString) {
      return new Response(JSON.stringify({
        error: 'Missing required parameters'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    const startDate = new Date(startDateString + 'T00:00:00Z');
    const endDate = new Date(endDateString + 'T00:00:00Z');
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
      return new Response(JSON.stringify({
        error: 'Invalid date format or range'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 400
      });
    }
    // 2. --- Initialize Supabase Client ---
    // Use the Database generic to help type the client methods
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // 3. --- Fetch Regular Operating Hours ---
    const { data: operatingHoursData, error: hoursError } = await supabaseClient.from('operating_hours').select('day_of_week, open_time, close_time').eq('bar_id', barId);
    if (hoursError) throw new Error(`DB error fetching operating hours: ${hoursError.message}`);
    // Explicitly type the Map storing regular hours info
    const regularHoursMap = new Map(operatingHoursData?.map((h)=>[
        h.day_of_week,
        {
          openTime: h.open_time,
          closeTime: h.close_time
        }
      ]) || []);
    // 4. --- Fetch Exceptions within the Date Range ---
    const { data: exceptionsData, error: exceptionsError } = await supabaseClient.from('bar_exceptions').select('exception_date, is_closed, open_time, close_time').eq('bar_id', barId).gte('exception_date', startDateString).lte('exception_date', endDateString);
    if (exceptionsError) throw new Error(`DB error fetching exceptions: ${exceptionsError.message}`);
    // Explicitly type the Map storing exception info
    const exceptionsMap = new Map(exceptionsData?.map((e)=>[
        e.exception_date,
        {
          is_closed: e.is_closed,
          open_time: e.open_time,
          close_time: e.close_time
        }
      ]) || []);
    // 5. --- Iterate Through Date Range and Determine Status & Times ---
    // Explicitly type the Map storing the final status
    const dateStatusMap = new Map();
    let currentDate = new Date(startDate);
    while(currentDate <= endDate){
      const currentDateString = currentDate.toISOString().split('T')[0];
      const exceptionInfo = exceptionsMap.get(currentDateString);
      if (exceptionInfo) {
        // --- Handle Exception Day ---
        dateStatusMap.set(currentDateString, {
          isOpen: !exceptionInfo.is_closed,
          isException: true,
          openTime: !exceptionInfo.is_closed ? exceptionInfo.open_time : null,
          closeTime: !exceptionInfo.is_closed ? exceptionInfo.close_time : null
        });
      } else {
        // --- No Exception: Check Regular Hours ---
        const dayOfWeekEnum = getDayOfWeekEnum(currentDate);
        const regularHours = dayOfWeekEnum ? regularHoursMap.get(dayOfWeekEnum) : undefined;
        if (regularHours) {
          // Bar is regularly open on this day
          dateStatusMap.set(currentDateString, {
            isOpen: true,
            isException: false,
            openTime: regularHours.openTime,
            closeTime: regularHours.closeTime
          });
        }
      }
      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }
    // 6. --- Return Successful Response with the New Structure ---
    const responseBody = {
      dateStatus: Object.fromEntries(dateStatusMap)
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
    console.error('Edge Function Error:', error);
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

