import { supabase } from '@/src/lib/supabase';
import type { CustomerProfile, StaffProfile } from './types';

export async function searchCustomers(query: string): Promise<CustomerProfile[]> {
  if (!query) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role')
    .eq('role', 'customer')
    .or(`email.ilike.%${query}%,name.ilike.%${query}%`);
  if (error) throw error;
  return data ?? [];
}

export async function promoteToStaff(targetUserId: string, assignedBarId: string): Promise<void> {
  const { error } = await supabase.rpc('promote_to_staff', {
    target_user_id: targetUserId,
    assigned_bar_id: assignedBarId,
  });
  if (error) throw error;
}

// Fetch all staff for a given bar
export async function fetchBarStaff(barId: string): Promise<StaffProfile[]> {
  const { data, error } = await supabase
    .from('staff_assignments')
    .select('staff_user_id, profiles:staff_user_id(id, email, name, role)')
    .eq('bar_id', barId);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.profiles.id,
    email: row.profiles.email,
    name: row.profiles.name,
    role: row.profiles.role,
    bar_id: barId,
  }));
}

// Remove/demote a staff member from a bar
export async function removeStaff(userId: string, barId: string): Promise<void> {
  const { error } = await supabase.rpc('demote_staff', {
    target_user_id: userId,
    bar_id: barId,
  });
  if (error) throw error;
}
