// FeatureGuard.tsx
import { ReactNode, useContext } from 'react'
import { UserContext } from '@/contexts/UserContext'
import { Permission, hasPermission } from '@/security/permissions'

interface FeatureGuardProps {
  permission: Permission
  children: ReactNode
  fallback?: ReactNode
}

export default function FeatureGuard({
  permission,
  children,
  fallback = null,
}: FeatureGuardProps) {
  const userContext = useContext(UserContext)

  // If context isn't ready, deny by default (secure-by-default)
  if (!userContext) {
    return <>{fallback}</>
  }

  const { role } = userContext

  if (!hasPermission(role, permission)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}