import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/supabaseClient"

export default function AuthBootstrapGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true

    async function init() {
      await supabase.auth.getSession()

      if (mounted) setReady(true)
    }

    init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (mounted) setReady(true)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        Loading…
      </div>
    )
  }

  return <>{children}</>
}