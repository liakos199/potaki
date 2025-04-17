# Reservation Handling Workflow
User Action: Customer selects a Bar, desired Date, Seat Type (e.g., 'table', 'vip'), and Party Size.
Frontend Availability Display (Initial):
Fetch the seat_options record for the selected Bar and Seat Type to get its id (target_seat_option_id) and available_count.
Query the reservations table: SELECT COUNT(*) FROM reservations WHERE seat_option_id = target_seat_option_id AND reservation_date = selected_date AND status = 'confirmed'.
Display availability to the user (e.g., available_count - count spots left). Disable booking options if the count is >= available_count.
Frontend Realtime Subscription (Handling Race Condition UX):
The customer's browser subscribes to INSERT events on the reservations table using Supabase Realtime.
The subscription is filtered for the specific seat_option_id and reservation_date the user is currently viewing.
If a Realtime INSERT event is received: Increment the local count of reservations in the browser's state. Re-calculate remaining spots. If remaining spots reach zero, immediately update the UI to disable the "Book Now" button and show a message like "Sorry, the last spot was just booked!".
User Clicks "Book Now":
The request is sent to your backend (e.g., a Supabase Edge Function).
Backend Availability Check & Insertion (Atomic Operation - Handling Race Condition Correctness):
Crucially, within a single database transaction:
Re-fetch the available_count from seat_options for the target_seat_option_id.
Re-query the current count: SELECT COUNT(*) FROM reservations WHERE seat_option_id = target_seat_option_id AND reservation_date = selected_date AND status = 'confirmed'.
Compare: If current_count < available_count, proceed to insert the new reservation record into the reservations table with status = 'confirmed'. Commit the transaction. Return success to the user.
If current_count >= available_count: The spot was taken between the user viewing the page and clicking book (or by another user simultaneously). Abort the transaction. Return a specific error message to the user (e.g., "Sorry, this option is no longer available.").
Staff View (Realtime Enabled):
Staff dashboards subscribe to Realtime changes on the reservations table (filtered by their bar_id and potentially the current/selected reservation_date).
New bookings, cancellations, or status updates appear instantly on their screen without manual refresh.
Guest Arrival:
Staff consult the list of confirmed reservations for the current date and the requested seat_option_type.
Staff manually guide the guest to an appropriate physical spot (table, bar seat, VIP area) based on the reservation type and party size. The system doesn't dictate the specific physical table.