// src/compliance/gdp/dataRetention.ts
export const dataRetentionPolicies = {
  orders: 7 * 365, // 7 years for tax purposes
  profiles: null, // Indefinite until account deletion
  analytics: 26 * 30, // 26 months
  logs: 90, // 90 days
}

export function calculateRetentionDate(days: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date
}

export function shouldPurgeData(createdAt: string, retentionDays: number | null): boolean {
  if (retentionDays === null) return false
  
  const created = new Date(createdAt)
  const retentionDate = new Date(created)
  retentionDate.setDate(retentionDate.getDate() + retentionDays)
  
  return new Date() > retentionDate
}
