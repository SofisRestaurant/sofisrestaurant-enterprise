import { useContext } from 'react';
import { SupabaseContext, SupabaseContextType } from './context';

export function useSupabase(): SupabaseContextType {
  const context = useContext(SupabaseContext);
  if (!context) throw new Error('useSupabase must be used within a SupabaseProvider');
  return context;
}