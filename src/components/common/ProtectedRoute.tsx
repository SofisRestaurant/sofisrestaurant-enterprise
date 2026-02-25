// src/components/common/ProtectedRoute.tsx
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useUserContext } from '@/contexts/useUserContext'

interface ProtectedRouteProps {
  children: ReactNode
  requireAdmin?: boolean
}

export default function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { user, isAdmin, loading } = useUserContext()
  const location = useLocation()

  // Prevent redirect flicker while session is loading
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-gray-600">Loading…</div>
      </div>
    )
  }

  // Not logged in -> send to home and remember where they tried to go
  if (!user) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  // Require admin
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}