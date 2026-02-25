import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react'
import { useUserContext } from '@/contexts/useUserContext'
import Button from '@/components/ui/Button'

export interface LoginFormProps {
  onSuccess: () => void
  onSwitchToSignup: () => void
  onForgotPassword: () => void
}

export function LoginForm({
  onSuccess,
  onSwitchToSignup,
  onForgotPassword,
}: LoginFormProps) {
  const { signIn } = useUserContext()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [blockedUntil, setBlockedUntil] = useState<number | null>(null)
  const [timeLeft, setTimeLeft] = useState<number>(0)

  // Countdown timer
  useEffect(() => {
    if (!blockedUntil) return

    const interval = setInterval(() => {
      const remaining = Math.max(0, blockedUntil - Date.now())
      setTimeLeft(remaining)

      if (remaining === 0) {
        setBlockedUntil(null)
        setError(null)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [blockedUntil])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (blockedUntil) return

    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await signIn(email, password)
      onSuccess()
    }
    catch (err: unknown) {
  const message =
    err instanceof Error
      ? err.message
      : 'Sign-in failed'

  if (/too many|rate limit/i.test(message)) {
    const lockTime = Date.now() + 5 * 60 * 1000
    setBlockedUntil(lockTime)
    setError('Too many attempts. Please wait.')
  } else {
    setError(message)
  }
 } 
 finally {
      setIsLoading(false)
    }
  }

  const formatTime = (ms: number) => {
    const totalSeconds = Math.ceil(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }

  const isBlocked = !!blockedUntil

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {isBlocked && timeLeft > 0
              ? `Too many attempts. Try again in ${formatTime(timeLeft)}`
              : error}
          </span>
        </div>
      )}

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Email Address
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isBlocked}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none disabled:bg-gray-100"
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isBlocked}
            className="w-full pl-10 pr-12 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none disabled:bg-gray-100"
          />
          <button
  type="button"
  disabled={isBlocked}
  onClick={() => setShowPassword((prev) => !prev)}
  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 disabled:opacity-50"
>
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Forgot */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onForgotPassword}
          className="text-sm font-semibold text-orange-600 hover:text-orange-700"
        >
          Forgot password?
        </button>
      </div>

      <Button
        type="submit"
        disabled={isLoading || isBlocked}
        className="w-full"
        variant="primary"
        isLoading={isLoading}
      >
        {isBlocked
          ? `Locked (${formatTime(timeLeft)})`
          : 'Sign In'}
      </Button>

      <p className="text-center text-sm text-gray-600 mt-6">
        Don&apos;t have an account?{' '}
        <button
          type="button"
          onClick={onSwitchToSignup}
          className="text-orange-600 hover:text-orange-700 font-semibold"
        >
          Sign up
        </button>
      </p>
    </form>
  )
}

export default LoginForm