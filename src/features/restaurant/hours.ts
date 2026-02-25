// src/features/restaurant/hours.ts
export interface Hours {
  day: string
  open: string
  close: string
  isClosed?: boolean
}

export const restaurantHours: Hours[] = [
  { day: 'Monday', open: '11:00 AM', close: '10:00 PM' },
  { day: 'Tuesday', open: '11:00 AM', close: '10:00 PM' },
  { day: 'Wednesday', open: '11:00 AM', close: '10:00 PM' },
  { day: 'Thursday', open: '11:00 AM', close: '10:00 PM' },
  { day: 'Friday', open: '11:00 AM', close: '11:00 PM' },
  { day: 'Saturday', open: '10:00 AM', close: '11:00 PM' },
  { day: 'Sunday', open: '10:00 AM', close: '9:00 PM' },
]

export function isOpenNow(): boolean {
  const now = new Date()
  const day = now.toLocaleDateString('en-US', { weekday: 'long' })
  const currentHours = restaurantHours.find((h) => h.day === day)

  if (!currentHours || currentHours.isClosed) return false

  const currentTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })

  return currentTime >= currentHours.open && currentTime <= currentHours.close
}

export function getTodaysHours(): Hours | null {
  const day = new Date().toLocaleDateString('en-US', { weekday: 'long' })
  return restaurantHours.find((h) => h.day === day) || null
}