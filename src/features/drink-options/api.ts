import { supabase } from '@/src/lib/supabase';
import type { DrinkOption } from './types';

export async function fetchDrinkOptions(barId: string): Promise<DrinkOption[]> {
  const { data, error } = await supabase
    .from('drink_options')
    .select('*')
    .eq('bar_id', barId);
  if (error) throw error;
  return data;
}

export async function createDrinkOption(option: Omit<DrinkOption, 'id'>): Promise<DrinkOption> {
  const { data, error } = await supabase
    .from('drink_options')
    .insert([option])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDrinkOption(option: DrinkOption): Promise<DrinkOption> {
  const { id, ...rest } = option;
  const { data, error } = await supabase
    .from('drink_options')
    .update(rest)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDrinkOption(id: string): Promise<void> {
  const { error } = await supabase
    .from('drink_options')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
