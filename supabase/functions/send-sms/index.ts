// PATH: supabase/functions/send-sms/index.ts
// =============================================================================
// MIGRATED: replaced inline createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
// with supabaseAdmin() from shared module.
// All business logic, validation, and idempotency logic is unchanged.
// =============================================================================

import { supabaseAdmin }                                              from '../_shared/supabaseAdmin.ts';
import { getTwilioEnv, sendSms, normalizePhone, SmsTemplates }        from '../_shared/twilio.ts';
import { corsHeaders }                                                 from '../_shared/cors.ts';

type SmsEvent = 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

interface SendSmsPayload {
  order_id: string;
  event:    SmsEvent;
}

interface OrderRow {
  id:             string;
  customer_phone: string | null;
  order_number:   number | null;
  status:         string;
  payment_status: string;
}

interface SmsLogInsert {
  order_id:     string;
  event:        string;
  phone_suffix: string;
  twilio_sid:   string | null;
  status:       'sent' | 'failed';
  error:        string | null;
}

const ALLOWED_EVENTS    = new Set<SmsEvent>(['confirmed', 'preparing', 'ready', 'delivered', 'cancelled']);
const UUID_RE           = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SMS_PER_ORDER = 5;

function isValidEvent(v: unknown): v is SmsEvent {
  return typeof v === 'string' && ALLOWED_EVENTS.has(v as SmsEvent);
}

function isValidUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function formatOrderNumber(n: number | null): string {
  if (!n || !Number.isFinite(n)) return '0000';
  return String(Math.trunc(n)).padStart(4, '0');
}

function buildSmsBody(event: SmsEvent, orderNumber: string): string {
  switch (event) {
    case 'confirmed':  return SmsTemplates.orderConfirmed(orderNumber);
    case 'preparing':  return SmsTemplates.orderPreparing(orderNumber);
    case 'ready':      return SmsTemplates.orderReady(orderNumber);
    case 'delivered':  return SmsTemplates.orderDelivered(orderNumber);
    case 'cancelled':  return SmsTemplates.orderCancelled(orderNumber);
  }
}

type LogOutcome = 'sent' | 'skipped' | 'failed' | 'error' | 'unauthorized';

function structuredLog(
  outcome: LogOutcome,
  orderId: string,
  event: string,
  detail: Record<string, unknown>,
): void {
  console.log(JSON.stringify({
    ts: new Date().toISOString(), fn: 'send-sms', outcome, order_id: orderId, event, ...detail,
  }));
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  const cors    = corsHeaders(req);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(cors ?? {}) };
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    const cors = corsHeaders(req);
    if (!cors) return new Response('Origin not allowed', { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }

  // 1. INTERNAL KEY AUTH — unchanged
  const internalKey = Deno.env.get('INTERNAL_FUNCTION_KEY');
  if (!internalKey) {
    console.error(JSON.stringify({ fn: 'send-sms', outcome: 'error', detail: 'INTERNAL_FUNCTION_KEY not set' }));
    return jsonResponse(req, { ok: false, error: 'Service misconfigured' }, 503);
  }
  if (req.headers.get('x-internal-key') !== internalKey) {
    console.warn(JSON.stringify({ fn: 'send-sms', outcome: 'unauthorized', ip: req.headers.get('x-forwarded-for') ?? 'unknown' }));
    return jsonResponse(req, { ok: false, error: 'Unauthorized' }, 401);
  }

  // 2. PARSE + VALIDATE — unchanged
  let body: SendSmsPayload;
  try { body = await req.json() as SendSmsPayload; }
  catch { return jsonResponse(req, { ok: false, error: 'Invalid JSON body' }, 400); }

  if (!isValidUuid(body?.order_id)) return jsonResponse(req, { ok: false, error: 'order_id must be a valid UUID' }, 400);
  if (!isValidEvent(body?.event))   return jsonResponse(req, { ok: false, error: `event must be one of: ${[...ALLOWED_EVENTS].join(', ')}` }, 400);

  const { order_id, event } = body;

  // 3. DB CLIENT — migrated from inline createClient to supabaseAdmin()
  const db = supabaseAdmin();

  // 4. FETCH ORDER — unchanged
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, customer_phone, order_number, status, payment_status')
    .eq('id', order_id)
    .maybeSingle<OrderRow>();

  if (orderError || !order) {
    structuredLog('error', order_id, event, { reason: 'order_not_found', db_error: orderError?.message ?? null });
    return jsonResponse(req, { ok: false, error: 'Order not found' }, 404);
  }

  // 5. NORMALIZE PHONE — unchanged
  const phone = normalizePhone(order.customer_phone);
  if (!phone) {
    structuredLog('skipped', order_id, event, { reason: 'no_valid_phone' });
    return jsonResponse(req, { ok: true, skipped: true, reason: 'no_valid_phone' });
  }

  // 6. IDEMPOTENCY — unchanged
  const { data: existingLog } = await db
    .from('sms_log').select('id').eq('order_id', order_id).eq('event', event).maybeSingle();
  if (existingLog) {
    structuredLog('skipped', order_id, event, { reason: 'already_sent' });
    return jsonResponse(req, { ok: true, skipped: true, reason: 'already_sent' });
  }

  // 7. RATE LIMIT — unchanged
  const { count: smsCount } = await db
    .from('sms_log').select('id', { count: 'exact', head: true }).eq('order_id', order_id);
  if ((smsCount ?? 0) >= MAX_SMS_PER_ORDER) {
    structuredLog('skipped', order_id, event, { reason: 'rate_limit', count: smsCount });
    return jsonResponse(req, { ok: true, skipped: true, reason: 'rate_limit_reached' });
  }

  // 8. SEND — unchanged
  const orderNum  = formatOrderNumber(order.order_number);
  const smsBody   = buildSmsBody(event, orderNum);
  const twilioEnv = getTwilioEnv();
  const result    = await sendSms({ env: twilioEnv, to: phone, body: smsBody });

  // 9. LOG — unchanged
  const logRow: SmsLogInsert = {
    order_id, event,
    phone_suffix: phone.slice(-4),
    twilio_sid:   result.sid ?? null,
    status:       result.ok ? 'sent' : 'failed',
    error:        result.error ?? null,
  };
  const { error: logError } = await db.from('sms_log').insert(logRow);
  if (logError) {
    console.error(JSON.stringify({ fn: 'send-sms', outcome: 'log_failed', order_id, event, log_error: logError.message }));
  }

  if (!result.ok) {
    structuredLog('failed', order_id, event, { twilio_error: result.error });
    return jsonResponse(req, { ok: false, error: result.error }, 502);
  }

  structuredLog('sent', order_id, event, { sid: result.sid, order_num: orderNum });
  return jsonResponse(req, { ok: true, sid: result.sid });
});