import { useUserContext } from '@/contexts/useUserContext'

export function useUser() {
  return useUserContext()
}

export default useUser
