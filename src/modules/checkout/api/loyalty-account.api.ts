// src/modules/checkout/api/loyalty-account.api.ts
//
// Fetches the current user's loyalty account from the loyalty-account Edge Function.
//
// supabase.functions.invoke() returns `data` typed as `any` (older SDK) or
// `unknown` (newer SDK). Either way, property access without runtime narrowing
// is an unsafe member access lint violation.
//
// Fix: cast rawData to `unknown` and use isRecord() — already used elsewhere
// in the checkout module — to narrow before every property read.

import { supabase } from '@/lib/supabase/supabaseClient';
import { isRecord } from '@/modules/checkout/types/checkout.types';

export type LoyaltyAccountResult = {
  accountId: string;
  balance: number;
  lastRedeemAt: string | null;
};

export async function getLoyaltyAccount(): Promise<LoyaltyAccountResult | null> {
  try {
    const { data: rawData, error } = await supabase.functions.invoke('loyalty-account');
    if (error) return null;

    // Treat as unknown — isRecord() narrows before every property access.
    const data: unknown = rawData;
    if (!isRecord(data) || data['ok'] !== true) return null;

    const account: unknown = data['account'];
    if (!isRecord(account) || typeof account['id'] !== 'string') return null;

    return {
      accountId: account['id'],
      balance: typeof account['balance'] === 'number' ? account['balance'] : 0,
      lastRedeemAt:
        typeof account['last_redeem_at'] === 'string' ? account['last_redeem_at'] : null,
    };
  } catch {
    return null;
  }
}