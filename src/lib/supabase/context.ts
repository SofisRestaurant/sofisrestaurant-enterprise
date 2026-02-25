import { createContext } from 'react';
import { User, Session } from '@supabase/supabase-js';

export interface SupabaseContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

// Only export the context here
export const SupabaseContext = createContext<SupabaseContextType | undefined>(undefined);