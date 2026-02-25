import { useEffect, useState } from "react"
import AuthBootstrapGuard from "./boot/AuthBootstrapGuard"
import { runStartupHealthCheck } from "@/security/StartupHealthCheck"
import { retryStartup } from "@/lib/resilience/startupRetry"

type BootState =
  | "loading"
  | "ready"
  | "fallback"
  | "fatal"

export default function AppBoot({
  children,
}: {
  children: React.ReactNode
}) {
  const [state, setState] = useState<BootState>("loading")

  useEffect(() => {
    const boot = async () => {
      try {
        const result = await retryStartup(async () => {
          const health = await runStartupHealthCheck()

          if (!health.ok) {
            throw new Error(health.reason)
          }

          return health
        })

        console.log("🟢 Startup healthy:", result)
        setState("ready")
      } catch (err) {
        console.warn("⚠️ Startup fallback mode:", err)

        // Silent recovery mode
        setState("fallback")

        // ALERT OWNER (future hook)
        console.error("🚨 SYSTEM ALERT:", err)
      }
    }

    boot()
  }, [])

  if (state === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        Starting system...
      </div>
    )
  }

  // FALLBACK MODE (app still runs)
  if (state === "fallback") {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="p-4 bg-yellow-600 text-black text-sm font-bold text-center">
          ⚠️ Running in fallback mode — backend unstable
        </div>
        <AuthBootstrapGuard>{children}</AuthBootstrapGuard>
      </div>
    )
  }

  if (state === "fatal") {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-red-500">
        System offline
      </div>
    )
  }

  return (
    <AuthBootstrapGuard>
      {children}
    </AuthBootstrapGuard>
  )
}