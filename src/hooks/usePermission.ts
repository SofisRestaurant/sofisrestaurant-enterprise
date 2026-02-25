import { useContext } from 'react'
import { UserContext } from '@/contexts/UserContext'
import { Permission, hasPermission } from '@/security/permissions'

export function usePermission() {
  const userContext = useContext(UserContext)

  if (!userContext) {
    throw new Error('usePermission must be used within UserContext.Provider')
  }

  const { role, user } = userContext

  return {
    can: (permission: Permission) => hasPermission(role, permission),
    role,
    user,
  }
}
