import { useState, type FormEvent } from 'react'
import { useAuth } from '../useAuth'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { formatAuthError } from '../auth.utils'

interface ForgotPasswordModalProps {
  isOpen: boolean
  onClose: () => void
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ForgotPasswordModal({
  isOpen,
  onClose,
}: ForgotPasswordModalProps) {
  const { resetPassword } = useAuth()

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const resetState = () => {
    setEmail('')
    setError(null)
    setSuccess(false)
    setLoading(false)
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    const cleanedEmail = email.trim()

    if (!cleanedEmail) {
      setError('Please enter your email.')
      return
    }

    if (!EMAIL_REGEX.test(cleanedEmail)) {
      setError('Please enter a valid email address.')
      return
    }

    setLoading(true)
    try {
      await resetPassword(cleanedEmail, {
        redirectTo: `${window.location.origin}/update-password`,
      })
      setSuccess(true)
    } catch (err) {
      setError(formatAuthError(err as Error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Reset Password">
      {success ? (
        <div className="py-4 text-center">
          <div className="mb-4">
            <svg
              className="mx-auto h-14 w-14 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h3 className="mb-2 text-lg font-semibold text-gray-900">
            Check your email
          </h3>

          <p className="mb-6 text-sm text-gray-600">
            We&apos;ve sent a password reset link to{' '}
            <strong className="text-gray-900">{email.trim()}</strong>
          </p>

          <Button onClick={handleClose} className="w-full">
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-gray-600">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>

          <div>
            <label
              htmlFor="reset-email"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="reset-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              disabled={loading}
              autoComplete="email"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 outline-none focus:border-transparent focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:bg-gray-50"
            />
          </div>

          {error && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={handleClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>

            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? <Spinner size="sm" /> : 'Send Reset Link'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}