 import { useUserContext } from '@/contexts/useUserContext'
export function useAuth() {
  return useUserContext()
}