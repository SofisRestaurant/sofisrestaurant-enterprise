// src/pages/Account/EditProfile.tsx
import { useEffect, useState, type FormEvent } from 'react'
import { useUserContext } from '@/contexts/useUserContext'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { getMyProfile } from '@/lib/supabase/db/profile.api'
import type { Profile } from '@/types/profile'

export default function EditProfile() {
  const { user, updateProfile } = useUserContext()

  const userId = user?.id

  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // load profile once
  useEffect(() => {
    let mounted = true

    const run = async () => {
      if (!userId) return
      setLoading(true)
      setError(null)
      setSaved(false)

      try {
        const p = await getMyProfile(userId)
        if (!mounted) return
        setProfile(p)
        setFullName(p.full_name ?? '')
        setPhone(p.phone ?? '')
      } catch (e) {
        if (!mounted) return
        setError((e as Error).message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    run()

    return () => {
      mounted = false
    }
  }, [userId])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!userId) return

    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      // ✅ THIS IS THE MAGIC LINE
      const updated = await updateProfile({
        full_name: fullName.trim() ? fullName.trim() : null,
        phone: phone.trim() ? phone.trim() : null,
      })

      setProfile(updated)
      setSaved(true)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!userId) {
    return <div className="text-sm text-gray-600">Please sign in to edit your profile.</div>
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Edit Profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          Keep your contact info updated for orders and receipts.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          Profile updated successfully.
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Full name
            </label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2 outline-none focus:ring-2 focus:ring-primary"
              disabled={saving}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Phone
            </label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-2 outline-none focus:ring-2 focus:ring-primary"
              disabled={saving}
              placeholder="(623) 000-0000"
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <div className="font-medium text-gray-900">Account</div>
          <div className="mt-1">Email: {user.email}</div>
          <div>Role: {profile?.role}</div>
        </div>

        <Button type="submit" variant="primary" disabled={saving} className="w-full">
          {saving ? <Spinner size="sm" /> : 'Save changes'}
        </Button>
      </form>
    </div>
  )
}