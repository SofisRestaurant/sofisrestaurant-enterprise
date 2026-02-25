// src/compliance/ccpa/privacyControls.ts
export interface PrivacyRights {
  canAccessData: boolean
  canDeleteData: boolean
  canOptOutOfSale: boolean
  canCorrectData: boolean
}

export const ccpaRights: PrivacyRights = {
  canAccessData: true,
  canDeleteData: true,
  canOptOutOfSale: true,
  canCorrectData: true,
}

export async function requestDataExport(userId: string): Promise<void> {
  // In production, this would trigger a data export job
  console.log(`Data export requested for user: ${userId}`)
}

export async function requestDataDeletion(userId: string): Promise<void> {
  // In production, this would trigger account deletion
  console.log(`Data deletion requested for user: ${userId}`)
}

export function optOutOfDataSale(userId: string): void {
  localStorage.setItem(`opt_out_sale_${userId}`, 'true')
}

export function hasOptedOutOfSale(userId: string): boolean {
  return localStorage.getItem(`opt_out_sale_${userId}`) === 'true'
}