// supabase/functions/_shared/crypto.ts
// =============================================================================
// Cryptographic primitives — HMAC-SHA256 and SHA-256 hashing.
//
// Fixes applied:
//   [1] hexToBytes returns Uint8Array<ArrayBuffer> via explicit cast — resolves
//       TS2345 "Uint8Array<ArrayBufferLike> not assignable to BufferSource".
//       new Uint8Array(n) always allocates a fresh ArrayBuffer, so the cast is
//       sound. The issue is purely a TypeScript 5.7+ generic variance change
//       where Uint8Array<ArrayBufferLike> no longer satisfies BufferSource
//       (which requires ArrayBufferView<ArrayBuffer>).
//
//   [2] importHmacKey: added `await` before crypto.subtle.importKey() to
//       satisfy the `require-await` lint rule on the async function.
//
//   [3] buildIdentityKey: added `await` before sha256Hex() call for the same
//       reason. The return type is still Promise<string> — semantics unchanged.
// =============================================================================

const TEXT_ENCODER = new TextEncoder();

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────

/**
 * Signs `message` with HMAC-SHA256 using `secret`.
 * Returns a lowercase hex-encoded signature string.
 */
export async function signHmac(message: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret, ['sign']);
  const sig  = await crypto.subtle.sign('HMAC', key, TEXT_ENCODER.encode(message));
  return bytesToHex(new Uint8Array(sig));
}

/**
 * Verifies that `signature` (hex) is a valid HMAC-SHA256 signature for
 * `message` under `secret`.
 *
 * Uses SubtleCrypto.verify() — timing-safe by specification.
 * Returns false on any error rather than throwing.
 */
export async function verifyHmac(
  message:   string,
  signature: string,
  secret:    string,
): Promise<boolean> {
  try {
    const key      = await importHmacKey(secret, ['verify']);
    const sigBytes = hexToBytes(signature); // Uint8Array<ArrayBuffer>
    return await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,                              // [1] typed as ArrayBuffer-backed
      TEXT_ENCODER.encode(message),
    );
  } catch {
    return false;
  }
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

/**
 * Returns a lowercase hex SHA-256 digest of `input`.
 */
export async function sha256Hex(input: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', TEXT_ENCODER.encode(input));
  return bytesToHex(new Uint8Array(hash));
}

/**
 * Builds a stable, opaque identity key for challenge token binding.
 *
 * Auth users  → SHA-256(userId)
 * Guests      → SHA-256(lowercased email)
 * Neither     → '' (callers must guard against empty return)
 */
export async function buildIdentityKey(
  userId:     string | null,
  guestEmail: string | null,
): Promise<string> {
  const raw =
    (userId && userId !== 'guest' ? userId : null) ??
    guestEmail?.toLowerCase().trim()              ??
    '';

  if (!raw) return '';
  return await sha256Hex(raw);   // [3] await added — satisfies require-await
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function importHmacKey(
  secret: string,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  // [2] await added — satisfies require-await lint rule.
  return await crypto.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts a lowercase hex string to a Uint8Array<ArrayBuffer>.
 *
 * Return type is explicitly Uint8Array<ArrayBuffer> (not the wider
 * Uint8Array<ArrayBufferLike>) because new Uint8Array(n) always allocates
 * a fresh ArrayBuffer. The cast resolves TS2345 when passing the result to
 * SubtleCrypto methods that require BufferSource / ArrayBufferView<ArrayBuffer>.
 */
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) {
    throw new RangeError(`Hex string must have even length, got ${hex.length}`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i >> 1] = parseInt(hex.slice(i, i + 2), 16);
  }
  // new Uint8Array(n) always uses an ArrayBuffer — safe to narrow the type.
  return bytes as unknown as Uint8Array<ArrayBuffer>;
}