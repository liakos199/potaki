import { supabase } from '@/src/lib/supabase';
import type { Bar, CreateBarInput, UpdateBarInput } from './types';

export async function fetchOwnerBars(ownerId: string): Promise<Bar[]> {
  const { data, error } = await supabase
    .from('bars')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createBar(input: CreateBarInput): Promise<Bar> {
  // owner_id is now part of the input type, no need to add it separately
  const { data, error } = await supabase
    .from('bars')
    .insert([input]) // Directly insert the input object
    .select()        // Select all columns of the newly created row
    .single();       // Expect exactly one row back

  if (error) {
    console.error("Supabase createBar error:", error);
    // Throw a more informative error if possible
    throw new Error(error.message || 'Failed to create bar in database.');
  }

  if (!data) {
    // This case shouldn't happen if insert was successful and no error, but good practice
    throw new Error('Bar created successfully, but no data returned.');
  }

  // Ensure the returned data conforms to the Bar type (basic check)
  // You might add more robust runtime validation if needed
  return data as Bar;
}

export async function updateBar(input: UpdateBarInput): Promise<Bar> {
  const { id, ...updates } = input;
  const { data, error } = await supabase
    .from('bars')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Delete bar and demote all staff to 'customer' (calls removeStaff for each staff member)
import { fetchBarStaff, removeStaff } from '@/src/features/staff/api';

export async function deleteBarAndDemoteStaff(barId: string): Promise<void> {
  // 1. Fetch all staff for this bar
  const staff = await fetchBarStaff(barId);
  // 2. Demote each staff member (in parallel)
  await Promise.all(staff.map((member) => removeStaff(member.id, barId)));
  // 3. Delete the bar
  const { error } = await supabase
    .from('bars')
    .delete()
    .eq('id', barId);
  if (error) throw error;
}

export async function deleteBar(barId: string): Promise<void> {
  const { error } = await supabase
    .from('bars')
    .delete()
    .eq('id', barId);
  if (error) throw error;
}

// Fetch bars assigned to a staff user
export async function fetchAssignedBars(staffUserId: string): Promise<Bar[]> {
  const { data, error } = await supabase
    .from('staff_assignments')
    .select('bar_id, bars(*)')
    .eq('staff_user_id', staffUserId);
  if (error) throw error;
  // Map to Bar[]
  return (data ?? []).map((row: any) => row.bars).filter(Boolean);
}
