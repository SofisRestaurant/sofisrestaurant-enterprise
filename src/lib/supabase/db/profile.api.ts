// src/lib/supabase/db/profile.api.ts
import { supabase } from '@/lib/supabase/supabaseClient'
import type { Profile } from '@/types/profile'

export async function getMyProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, full_name, phone, created_at, updated_at')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data as Profile
}

export async function updateMyProfile(
  userId: string,
  input: Pick<Profile, 'full_name' | 'phone'>
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: input.full_name,
      phone: input.phone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('id, role, full_name, phone, created_at, updated_at')
    .single()

  if (error) throw error
  return data as Profile
}
