// =============================================================================
// src/domain/menu/menu.service.write.ts
// MENU WRITE SERVICE — Production (2026)
// =============================================================================
//
// Responsibility:
//   All CUD operations on menu items, routed through the admin-gateway Edge
//   Function. Reads go through MenuPublicService / MenuAdminService instead.
//
// Auth:
//   Uses requireAccessToken() from session.ts — always returns a fresh JWT,
//   transparently refreshing the session when the access token is stale.
//   Falls back to an empty bearer (public routes) rather than throwing.
//
// Retry:
//   Network-level failures (5xx, timeout) are retried up to MAX_RETRIES times
//   with exponential backoff + jitter. 4xx errors are never retried (caller
//   bug or validation failure — retrying is pointless).
//
// Abort:
//   Every method accepts an optional AbortSignal. Aborting mid-flight throws
//   a DOMException (name === 'AbortError') — callers can check with
//   isAbortError(err) re-exported below.
//
// Dependency flow:
//   menu.service.write  →  session.ts          (token)
//   menu.service.write  →  menu.admin.mapper   (row → domain)
//   menu.service.write  →  menu.db.types       (Insert / Update / AdminRow)
//   menu.service.write  →  menu.types          (MenuItemAdmin)
//   menu.service.write  →  never imports from UI / pages
//
// =============================================================================

import { getAccessToken } from '@/lib/supabase/session';
import { MenuAdminMapper } from './menu.admin.mapper';
import type { MenuItemAdminRow, MenuItemInsert, MenuItemUpdate } from './menu.db.types';
import type { MenuItemAdmin } from './menu.types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const GATEWAY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-gateway`;

/** Maximum number of retry attempts for retryable failures (5xx / network). */
const MAX_RETRIES = 2;

/** Base delay in ms for exponential backoff. Actual = BASE * 2^attempt + jitter. */
const RETRY_BASE_MS = 300;

// ─────────────────────────────────────────────────────────────────────────────
// Error class
// ─────────────────────────────────────────────────────────────────────────────

export class MenuWriteError extends Error {
  public readonly id: string;
  public readonly operation: 'create' | 'update' | 'delete' | 'duplicate';
  public readonly status: number;
  public readonly code: string;

  constructor(
    operation: 'create' | 'update' | 'delete' | 'duplicate',
    id: string,
    message: string,
    status = 500,
    code = 'GATEWAY_ERROR',
  ) {
    super(message);
    this.name = 'MenuWriteError';
    this.operation = operation;
    this.id = id;
    this.status = status;
    this.code = code;
  }
}

/** Type-safe narrowing for MenuWriteError — use in catch blocks. */
export function isMenuWriteError(err: unknown): err is MenuWriteError {
  return err instanceof MenuWriteError;
}

/** Type-safe narrowing for AbortError — use when an AbortSignal may fire. */
export function isAbortError(err: unknown): err is DOMException {
  return err instanceof DOMException && err.name === 'AbortError';
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

type WriteOperation = 'create' | 'update' | 'delete' | 'duplicate';

function assertId(id: string, operation: WriteOperation): void {
  if (!id || id.trim().length === 0) {
    throw new MenuWriteError(operation, id, `Menu item id is required for ${operation}.`, 400, 'MISSING_ID');
  }
}

function isRetryableStatus(status: number): boolean {
  // 429 Too Many Requests, 502/503/504 gateway/upstream errors
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(attempt: number): number {
  // Exponential backoff with ±20 % jitter to avoid thundering herd
  const base = RETRY_BASE_MS * Math.pow(2, attempt);
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.round(base + jitter);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

/**
 * Validates that a gateway response looks like a MenuItemAdminRow.
 * Protects against null / wrong-shaped data silently slipping through.
 */
function assertAdminRow(
  raw: unknown,
  operation: WriteOperation,
  id: string,
): asserts raw is MenuItemAdminRow {
  if (
    raw === null ||
    raw === undefined ||
    typeof raw !== 'object' ||
    typeof (raw as Record<string, unknown>).id !== 'string'
  ) {
    throw new MenuWriteError(
      operation,
      id,
      'Gateway returned an invalid or empty response.',
      502,
      'INVALID_GATEWAY_RESPONSE',
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway fetch layer
// ─────────────────────────────────────────────────────────────────────────────

interface GatewayCallOptions {
  action: string;
  payload: unknown;
  operation: WriteOperation;
  id: string;
  signal?: AbortSignal;
}

/**
 * Core gateway fetch with automatic retry on transient failures.
 * - Respects AbortSignal throughout (fetch + backoff sleep).
 * - Throws MenuWriteError for all application-level failures.
 * - Re-throws DOMException (AbortError) untouched so callers can detect it.
 */
async function callGateway<T = unknown>({
  action,
  payload,
  operation,
  id,
  signal,
}: GatewayCallOptions): Promise<T> {
  let attempt = 0;
console.log('[Gateway Payload]', { action, payload, operation, id });
  while (true) {
    // Abort check before each attempt (covers the sleep between retries too)
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const token = await getAccessToken();

    let res: Response;
    try {
      res = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action, payload }),
        signal,
      });
    } catch (err) {
      // AbortError — surface immediately, no retry
      if (isAbortError(err)) throw err;

      // Network-level failure (offline, DNS, etc.) — retry if budget remains
      if (attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(attempt), signal);
        attempt++;
        continue;
      }

      throw new MenuWriteError(
        operation,
        id,
        err instanceof Error ? err.message : 'Network request failed.',
        0,
        'NETWORK_ERROR',
      );
    }

    // ── 2xx ──────────────────────────────────────────────────────────────────
    if (res.ok) {
      const json = (await res.json()) as { data?: T };
      return json.data ?? (null as unknown as T);
    }

    // ── Retryable HTTP ────────────────────────────────────────────────────────
    if (isRetryableStatus(res.status) && attempt < MAX_RETRIES) {
      await sleep(retryDelayMs(attempt), signal);
      attempt++;
      continue;
    }

    // ── Non-retryable HTTP error ──────────────────────────────────────────────
    let message = `Gateway ${operation} failed (HTTP ${res.status}).`;
    let code = 'GATEWAY_ERROR';
    try {
      const body = (await res.json()) as { error?: string; code?: string; message?: string };
      const errMsg = body.error ?? body.message;
      if (errMsg) message = errMsg;
      if (body.code) code = body.code;
    } catch {
      // Response body was not JSON — keep the default message
    }

    throw new MenuWriteError(operation, id, message, res.status, code);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public service
// ─────────────────────────────────────────────────────────────────────────────

export class MenuWriteService {
  // ── CREATE ──────────────────────────────────────────────────────────────────

  /**
   * Create a new menu item.
   *
   * @param payload  - DB insert shape (validated by caller before submission).
   * @param signal   - Optional AbortSignal to cancel the in-flight request.
   * @returns        Domain `MenuItemAdmin` built from the gateway's response row.
   */
  static async create(
    payload: MenuItemInsert,
    signal?: AbortSignal,
  ): Promise<MenuItemAdmin> {
    const raw = await callGateway<MenuItemAdminRow>({
      action: 'menu:create',
      payload,
      operation: 'create',
      id: '',
      signal,
    });

    assertAdminRow(raw, 'create', '');
    return MenuAdminMapper.map(raw);
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────

  /**
   * Update an existing menu item by id.
   *
   * @param id       - UUID of the menu item to update.
   * @param payload  - Partial update fields (any subset of `MenuItemUpdate`).
   * @param signal   - Optional AbortSignal to cancel the in-flight request.
   * @returns        Updated domain `MenuItemAdmin`.
   */
  static async update(
    id: string,
    payload: MenuItemUpdate,
    signal?: AbortSignal,
  ): Promise<MenuItemAdmin> {
    assertId(id, 'update');

    const raw = await callGateway<MenuItemAdminRow>({
      action: 'menu:update',
      payload: { id, data: payload },
      operation: 'update',
      id,
      signal,
    });

    assertAdminRow(raw, 'update', id);
    return MenuAdminMapper.map(raw);
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────

  /**
   * Permanently delete a menu item by id.
   * The gateway enforces soft-delete / audit trail on its end.
   *
   * @param id     - UUID of the menu item to delete.
   * @param signal - Optional AbortSignal to cancel the in-flight request.
   */
  static async delete(id: string, signal?: AbortSignal): Promise<void> {
    assertId(id, 'delete');

    await callGateway({
      action: 'menu:delete',
      payload: { id },
      operation: 'delete',
      id,
      signal,
    });
  }

  // ── DUPLICATE ───────────────────────────────────────────────────────────────

  /**
   * Clone an existing menu item with an optional set of field overrides.
   *
   * The gateway is responsible for deep-copying modifier groups and modifiers.
   * The client only controls top-level field overrides (e.g. a new name/price).
   *
   * @param sourceId  - UUID of the menu item to clone.
   * @param overrides - Fields to override on the duplicate (optional).
   * @param signal    - Optional AbortSignal to cancel the in-flight request.
   * @returns         Newly created `MenuItemAdmin` for the duplicate.
   */
  static async duplicate(
    sourceId: string,
    overrides: Partial<MenuItemInsert> = {},
    signal?: AbortSignal,
  ): Promise<MenuItemAdmin> {
    assertId(sourceId, 'duplicate');

    const raw = await callGateway<MenuItemAdminRow>({
      action: 'menu:duplicate',
      payload: { source_id: sourceId, overrides },
      operation: 'duplicate',
      id: sourceId,
      signal,
    });

    assertAdminRow(raw, 'duplicate', sourceId);
    return MenuAdminMapper.map(raw);
  }
}