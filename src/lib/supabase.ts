import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

// Check if the environment variables are loaded correctly (optional but recommended)
if (!supabaseUrl) {
  console.error("Supabase URL is not defined. Check your environment variables.");
  // You might want to throw an error or handle this case appropriately
}
if (!supabaseAnonKey) {
  console.error("Supabase Anon Key is not defined. Check your environment variables.");
  // You might want to throw an error or handle this case appropriately
}

// generate types : npx supabase gen types typescript --linked --schema public > src/lib/database.types.ts

// ---> 2. Add the <Database> generic type argument to createClient <---
export const supabase = createClient<Database>( // <--- THIS IS THE CHANGE
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);