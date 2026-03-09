import { service } from './service.ts';

const WINDOW_MS = 60_000;
const MAX_REQ = 60;

export async function rateLimit(userId: string) {
  const windowStart = new Date(Date.now() - WINDOW_MS).toISOString();

  const { count } = await service
    .from('internal.admin_access_logs')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', windowStart);

  if ((count ?? 0) > MAX_REQ) {
    throw new Error('Rate limit exceeded');
  }
}
