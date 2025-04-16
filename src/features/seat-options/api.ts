import { supabase } from '@/src/lib/supabase';
import type { SeatOption } from './types';

export async function fetchSeatOptions(barId: string): Promise<SeatOption[]> {
  const { data, error } = await supabase
    .from('seat_options')
    .select('*')
    .eq('bar_id', barId);
  if (error) throw error;
  return data ?? [];
}

export async function updateSeatOption(option: Partial<SeatOption> & { id: string }): Promise<SeatOption> {
  const { data, error } = await supabase
    .from('seat_options')
    .update(option)
    .eq('id', option.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createSeatOption(option: Omit<SeatOption, 'id'>): Promise<SeatOption> {
  const { data, error } = await supabase
    .from('seat_options')
    .insert([option])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSeatOption(id: string): Promise<void> {
  const { error } = await supabase
    .from('seat_options')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function createDefaultSeatOptions(barId: string): Promise<SeatOption[]> {
  const defaults: Omit<SeatOption, 'id'>[] = [
    { bar_id: barId, type: 'bar', enabled: true, available_count: 10, min_people: 1, max_people: 2 },
    { bar_id: barId, type: 'table', enabled: true, available_count: 10, min_people: 2, max_people: 6 },
    { bar_id: barId, type: 'vip', enabled: false, available_count: 2, min_people: 2, max_people: 10 },
  ];
  const { data, error } = await supabase
    .from('seat_options')
    .insert(defaults)
    .select();
  if (error) throw error;
  return data ?? [];
}
