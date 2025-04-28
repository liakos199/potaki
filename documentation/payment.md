Okay, you've got a solid foundation with your existing schema and the get-bar-availability function. Let's adapt the proposed solution.

1. Schema Modifications:

First, you need to update your database schema as discussed.

Update reservation_status Enum: Add pending_payment and expired to the allowed values. You can do this in the Supabase dashboard (Database -> Enums -> reservation_status -> Add Value) or via SQL:

-- Add new enum values (run these one by one if needed)
ALTER TYPE public.reservation_status ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE public.reservation_status ADD VALUE IF NOT EXISTS 'expired';


Add expires_at Column to reservations:

ALTER TABLE public.reservations
ADD COLUMN expires_at TIMESTAMPTZ NULL;

-- Optional: Add an index for querying expired reservations
CREATE INDEX IF NOT EXISTS idx_reservations_status_expires_at ON public.reservations (status, expires_at);
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
SQL
IGNORE_WHEN_COPYING_END

(Optional) Add payment_intent_id Column: If using Stripe or a similar provider, it's good to store the payment identifier.

ALTER TABLE public.reservations
ADD COLUMN payment_intent_id TEXT NULL;
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
SQL
IGNORE_WHEN_COPYING_END

2. Create create-pending-reservation Edge Function:

This function will check availability and create the temporary reservation.

// supabase/functions/create-pending-reservation/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Types (align with your schema) ---
type SeatOptionType = 'bar' | 'table' | 'vip';
type ReservationStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'pending_payment' | 'expired';

interface RequestPayload {
  bar_id: string;
  reservation_date: string; // Expect YYYY-MM-DD
  seat_type: SeatOptionType;
  party_size: number;
  special_requests?: string | null;
  // Optional: Add drinks data if needed for initial creation
  // drinks_data?: { drink_option_id: string; quantity: number }[];
}

// --- Config ---
const PENDING_RESERVATION_EXPIRY_MINUTES = 10; // How long the hold lasts

// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Adjust in production!
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Helper: Get Expiry Timestamp ---
function getExpiryTimestamp(minutes: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

// --- Helper: Get Customer ID from Auth ---
async function getCustomerId(supabase: SupabaseClient): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    console.error('Auth Error:', error?.message);
    throw new Error('Authentication failed.');
  }
  // You might need to fetch the profile ID if customer_id references profiles.id
  // For simplicity here, assuming user.id is the customer_id. Adjust if needed.
  // const { data: profile, error: profileError } = await supabase
  //   .from('profiles')
  //   .select('id')
  //   .eq('id', user.id) // Or eq('auth_user_id', user.id) depending on your setup
  //   .single();
  // if (profileError || !profile) throw new Error('Customer profile not found.');
  // return profile.id;
  return user.id;
}

// --- Main Function Logic ---
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // --- Initialize Supabase Client ---
    // Use SERVICE_ROLE_KEY for bypassing RLS within the function if needed,
    // BUT rely on Auth check for user identification.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables.');
    }
    // Create client with user's auth context preserved
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        global: { headers: { Authorization: req.headers.get('Authorization')! } },
        auth: {
             // Important: Use persistSession: false for serverless environments
             persistSession: false,
             autoRefreshToken: false,
             detectSessionInUrl: false,
         }
    });


    // --- Get Authenticated User ---
    let customerId: string;
    try {
        customerId = await getCustomerId(supabase);
    } catch (authError) {
         console.error('Auth Error in handler:', authError);
         return new Response(JSON.stringify({ error: 'Authentication required.' }), {
             headers: { ...corsHeaders, 'Content-Type': 'application/json' },
             status: 401,
         });
    }


    // --- Parse Request Body ---
    const payload: RequestPayload = await req.json();
    const { bar_id, reservation_date, seat_type, party_size, special_requests } = payload;

    // Basic validation
    if (!bar_id || !reservation_date || !seat_type || !party_size || party_size <= 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid request parameters.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
    // Validate date format (basic check)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reservation_date)) {
         return new Response(JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD.' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400,
         });
    }


    // --- Availability Check ---
    // 1. Fetch Seat Capacity & Rules
    const { data: seatOption, error: seatError } = await supabase
      .from('seat_options')
      .select('available_count, min_people, max_people, enabled')
      .eq('bar_id', bar_id)
      .eq('type', seat_type)
      .single();

    if (seatError) {
      console.error('Error fetching seat option:', seatError);
      throw new Error(`Database error fetching seat details: ${seatError.message}`);
    }
    if (!seatOption) {
      return new Response(JSON.stringify({ error: 'Seat type not found or configured for this bar.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }
    if (!seatOption.enabled) {
         return new Response(JSON.stringify({ error: 'This seat type is currently disabled.' }), {
             headers: { ...corsHeaders, 'Content-Type': 'application/json' },
             status: 400, // Bad Request - user chose something unavailable
         });
    }

    // 2. Validate Party Size against Seat Rules
    if (party_size < seatOption.min_people || party_size > seatOption.max_people) {
      return new Response(JSON.stringify({ error: `Party size (${party_size}) is invalid for ${seat_type} seating (${seatOption.min_people}-${seatOption.max_people} guests).` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 3. Count Existing Relevant Reservations (Confirmed + Valid Pending)
    // NOTE: This check is sequential with the insert, not truly atomic without DB transactions.
    // It significantly reduces but doesn't eliminate the race condition possibility.
    const now = new Date().toISOString();
    const { count: existingReservationsCount, error: countError } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true }) // Just need the count
      .eq('bar_id', bar_id)
      .eq('reservation_date', reservation_date)
      .eq('seat_type', seat_type)
      .in('status', ['confirmed', 'pending_payment']) // Check both statuses
      .or(`status.neq.pending_payment,and(status.eq.pending_payment,expires_at.gt.${now})`); // Filter out expired pending

    if (countError) {
      console.error('Error counting existing reservations:', countError);
      throw new Error(`Database error checking availability: ${countError.message}`);
    }

    // 4. Compare Count with Capacity
    const availableSlots = seatOption.available_count - (existingReservationsCount ?? 0);
    if (availableSlots <= 0) {
      console.log(`Slot taken: bar=${bar_id}, date=${reservation_date}, seat=${seat_type}. Capacity=${seatOption.available_count}, Reserved=${existingReservationsCount}`);
      return new Response(JSON.stringify({ error: 'Sorry, this time slot is no longer available. Please try another time or seating type.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409, // Conflict - indicates resource state prevents request
      });
    }

    // --- Create Pending Reservation ---
    const expiryTimestamp = getExpiryTimestamp(PENDING_RESERVATION_EXPIRY_MINUTES);
    const newReservationData = {
      bar_id: bar_id,
      customer_id: customerId,
      party_size: party_size,
      reservation_date: reservation_date,
      seat_type: seat_type,
      special_requests: special_requests || null,
      status: 'pending_payment' as ReservationStatus, // Explicitly type
      expires_at: expiryTimestamp,
      // payment_intent_id: null, // Initialize if you added the column
    };

    const { data: newReservation, error: insertError } = await supabase
      .from('reservations')
      .insert(newReservationData)
      .select('id') // Select the ID of the newly created reservation
      .single();

    if (insertError) {
      console.error('Error inserting pending reservation:', insertError);
      // Check for potential constraint violations (e.g., unique constraint if applicable)
      if (insertError.code === '23505') { // Unique violation (example)
          return new Response(JSON.stringify({ error: 'Failed to reserve slot, potentially due to a race condition. Please try again.' }), {
               headers: { ...corsHeaders, 'Content-Type': 'application/json' },
               status: 409, // Conflict
           });
      }
      throw new Error(`Database error creating reservation: ${insertError.message}`);
    }

    if (!newReservation || !newReservation.id) {
        console.error('Insert succeeded but did not return an ID.');
        throw new Error('Failed to retrieve reservation ID after creation.');
    }

    console.log(`Pending reservation created: ${newReservation.id} for bar ${bar_id}, date ${reservation_date}, expires ${expiryTimestamp}`);

    // --- Return Success Response ---
    return new Response(JSON.stringify({ success: true, reservationId: newReservation.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 201, // Created
    });

  } catch (error) {
    // --- Handle Errors ---
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'An unknown server error occurred.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
TypeScript
IGNORE_WHEN_COPYING_END

3. Create confirm-reservation-payment Edge Function:

This function confirms the reservation after successful payment.

// supabase/functions/confirm-reservation-payment/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- Types ---
type ReservationStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'pending_payment' | 'expired';

interface RequestPayload {
  reservation_id: string;
  payment_intent_id?: string; // Optional, but recommended
  // Add any other payment verification details if needed
}

// --- CORS Headers ---
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Adjust in production!
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Main Function Logic ---
serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // --- Security Note ---
  // How this function is called is CRITICAL.
  // - IDEAL: Called via a trusted webhook from your payment provider (e.g., Stripe).
  //   Verify the webhook signature here.
  // - LESS IDEAL: Called from your client-side AFTER client confirms payment.
  //   This relies on client honesty. The server checks below are vital.
  // You MUST ensure only legitimate, paid reservations trigger this.

  try {
    // --- Initialize Supabase Client ---
    // Use SERVICE_ROLE_KEY as this function needs elevated privileges to update any reservation
    // based on ID, potentially triggered by a webhook without user context.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables.');
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
         auth: { persistSession: false } // No user session needed for service role
    });

    // --- Parse Request Body ---
    const payload: RequestPayload = await req.json();
    const { reservation_id, payment_intent_id } = payload;

    if (!reservation_id) {
      return new Response(JSON.stringify({ error: 'Missing reservation_id.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // --- Find and Validate Pending Reservation ---
    const now = new Date().toISOString();
    const { data: reservation, error: fetchError } = await supabase
      .from('reservations')
      .select('id, status, expires_at')
      .eq('id', reservation_id)
      .single();

    if (fetchError) {
        if (fetchError.code === 'PGRST116') { // Resource not found
            console.warn(`Confirmation attempt for non-existent reservation ID: ${reservation_id}`);
             return new Response(JSON.stringify({ error: 'Reservation not found.' }), {
                 headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                 status: 404,
             });
        }
        console.error('Error fetching reservation:', fetchError);
        throw new Error(`Database error fetching reservation: ${fetchError.message}`);
    }

    // Check Status
    if (reservation.status !== 'pending_payment') {
      console.warn(`Confirmation attempt for reservation ${reservation_id} with wrong status: ${reservation.status}`);
      // Decide how to handle: Maybe it was already confirmed? Or cancelled?
      // Returning an error is safest initially.
      return new Response(JSON.stringify({ error: `Reservation has invalid status (${reservation.status}) for confirmation.` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 409, // Conflict - state prevents action
      });
    }

    // Check Expiry
    if (!reservation.expires_at || reservation.expires_at <= now) {
      console.warn(`Confirmation attempt for expired reservation ${reservation_id}. Expired at: ${reservation.expires_at}`);
      // If it expired, payment should ideally be refunded automatically if possible.
      // Inform the caller that confirmation failed due to expiry.
      return new Response(JSON.stringify({ error: 'Reservation confirmation failed: The payment window has expired.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 410, // Gone - indicates resource expired
      });
    }

    // --- Update Reservation to Confirmed ---
    const updateData: {
        status: ReservationStatus;
        expires_at: null;
        payment_intent_id?: string; // Conditionally add
    } = {
      status: 'confirmed',
      expires_at: null, // Clear expiry upon confirmation
    };
    if (payment_intent_id) {
        updateData.payment_intent_id = payment_intent_id; // Store payment ID if provided
    }


    const { error: updateError } = await supabase
      .from('reservations')
      .update(updateData)
      .eq('id', reservation_id);

    if (updateError) {
      console.error(`Error updating reservation ${reservation_id} to confirmed:`, updateError);
      throw new Error(`Database error confirming reservation: ${updateError.message}`);
    }

    console.log(`Reservation ${reservation_id} successfully confirmed.`);

    // --- Return Success Response ---
    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    // --- Handle Errors ---
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'An unknown server error occurred.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
TypeScript
IGNORE_WHEN_COPYING_END

4. Create cleanup-expired-reservations Edge Function (Scheduled):

// supabase/functions/cleanup-expired-reservations/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// --- CORS Headers (Required even for scheduled functions if you want to test via fetch) ---
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (_req) => {
    // Optional: Add security check if needed (e.g., check a secret header if invoked via HTTP)

    try {
        // Use Service Role Key for cleanup tasks
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        if (!supabaseUrl || !serviceRoleKey) {
            throw new Error('Missing Supabase environment variables.');
        }
        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false }
        });

        const now = new Date().toISOString();

        console.log(`[${now}] Running cleanup job for expired reservations...`);

        const { data, error, count } = await supabase
            .from('reservations')
            .update({ status: 'expired' }) // Update status to 'expired'
            .eq('status', 'pending_payment')
            .lt('expires_at', now) // Where status is pending AND expiry is in the past
            .select(); // Optional: Select updated rows for logging

        if (error) {
            console.error('Error during cleanup:', error);
            throw new Error(`Database error during cleanup: ${error.message}`);
        }

        console.log(`Cleanup complete. ${count ?? 0} reservations marked as expired.`);

        return new Response(JSON.stringify({ success: true, updated_count: count ?? 0 }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('Cleanup Function Error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
TypeScript
IGNORE_WHEN_COPYING_END

5. Deployment & Scheduling:

Deploy Functions: Deploy these three functions to your Supabase project using the Supabase CLI:

supabase functions deploy create-pending-reservation --no-verify-jwt
supabase functions deploy confirm-reservation-payment --no-verify-jwt # Or configure JWT verification if called from client
supabase functions deploy cleanup-expired-reservations --no-verify-jwt
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
Bash
IGNORE_WHEN_COPYING_END

--no-verify-jwt is used here assuming create-pending-reservation relies on the Authorization header passed through, and confirm/cleanup use the service key. Adjust if your auth strategy differs. For confirm-reservation-payment, if called via webhook, you'd implement webhook signature verification inside the function instead of relying on JWT.

Schedule Cleanup:

Go to the Supabase Dashboard -> Database -> Functions (or Extensions if pg_cron isn't enabled).

Enable pg_cron if it's not already.

Go to SQL Editor and run a command to schedule the cleanup function. Schedule it according to your PENDING_RESERVATION_EXPIRY_MINUTES. If it's 10 minutes, running every 5 minutes is reasonable.

-- Schedule 'cleanup-expired-reservations' to run every 5 minutes
SELECT cron.schedule(
  'cleanup-reservations', -- Job name (must be unique)
  '*/5 * * * *', -- Cron syntax for every 5 minutes
  $$
  SELECT net.http_post(
      url:='YOUR_SUPABASE_PROJECT_URL/functions/v1/cleanup-expired-reservations',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SUPABASE_SERVICE_ROLE_KEY"}'::jsonb,
      body:='{}'::jsonb
  );
  $$
);

-- To unschedule later:
-- SELECT cron.unschedule('cleanup-reservations');

-- To see scheduled jobs:
-- SELECT * FROM cron.job;
IGNORE_WHEN_COPYING_START
content_copy
download
Use code with caution.
SQL
IGNORE_WHEN_COPYING_END

Replace:

YOUR_SUPABASE_PROJECT_URL with your actual project URL (e.g., https://xyz.supabase.co).

YOUR_SUPABASE_SERVICE_ROLE_KEY with your actual service role key. Security Note: Storing the service key directly in the cron job isn't ideal long-term. Consider using database secrets or other secure methods if available/needed. For many cases, this direct invocation within the trusted database environment is acceptable.

Next Steps:

Integrate the createPendingReservationMutation into your new.tsx file as shown in the previous example.

Build your Payment screen.

Decide how confirm-reservation-payment will be triggered (webhook is recommended) and implement the call.

Test thoroughly, including expiry scenarios and trying to book the same slot simultaneously.