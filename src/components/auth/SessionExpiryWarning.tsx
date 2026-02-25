// src/components/auth/SessionExpiryWarning.tsx

import { useEffect, useState } from 'react'
import { useUserContext } from '@/contexts/useUserContext'

const WARNING_BEFORE_EXPIRY_MS = 5 * 60 * 1000 // 5 min

export default function SessionExpiryWarning() {
  const { session, refreshSession, signOut } = useUserContext()

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!session?.expires_at) return

    const interval = setInterval(() => {
      const expiryMs = session.expires_at! * 1000
      const diff = expiryMs - Date.now()

      if (diff <= WARNING_BEFORE_EXPIRY_MS) {
        setSecondsLeft(Math.max(0, Math.floor(diff / 1000)))
      } else {
        setSecondsLeft(null)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [session])

  if (secondsLeft === null) return null

  const minutes = Math.floor(secondsLeft / 60)
  const seconds = secondsLeft % 60

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 rounded-xl bg-white shadow-2xl border p-4">
      <h3 className="text-sm font-semibold mb-2">
        Your session is about to expire
      </h3>

      <p className="text-xs text-gray-600 mb-4">
        {minutes}:{seconds.toString().padStart(2, '0')}
      </p>

      <div className="flex gap-2">
        <button
          onClick={refreshSession}
          className="flex-1 bg-blue-600 text-white text-xs py-2 rounded-lg"
        >
          Stay signed in
        </button>

        <button
          onClick={signOut}
          className="flex-1 bg-gray-200 text-xs py-2 rounded-lg"
        >
          Logout
        </button>
      </div>
    </div>
  )
}