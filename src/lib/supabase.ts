import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  }
);

/**
 * Returns the current session if one exists, or null.
 * Does NOT create anonymous sessions — every customer must register with
 * a real email/password account so their workspace is properly isolated.
 */
export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

/**
 * Returns true if the current session belongs to a real (non-anonymous)
 * registered user. Anonymous sessions are treated as unauthenticated for
 * routing purposes.
 */
export async function hasRealSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return false;
  // Supabase marks anonymous users with is_anonymous in user metadata
  const isAnon = data.session.user?.is_anonymous === true;
  return !isAnon;
}
