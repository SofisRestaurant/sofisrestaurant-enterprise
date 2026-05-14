// PATH: supabase/functions/_shared/jwt.ts
// =============================================================================
// JWT VERIFICATION — Supabase JWKS Helper (2026)
// =============================================================================
//
// CHANGES FROM ORIGINAL (3 lines only):
//   [1] base64urlDecode: return type Uint8Array → Uint8Array<ArrayBuffer>,
//       return expression gains `as unknown as Uint8Array<ArrayBuffer>` cast.
//       Fixes TS2345 at the crypto.subtle.verify() call site.
//   [2] importRsaPublicKey: `return crypto.subtle` → `return await crypto.subtle`.
//       Fixes deno-lint require-await.
//   [3] verifyRequestJwt: `return verifyJwt(token)` → `return await verifyJwt(token)`.
//       Fixes deno-lint require-await.
//
// All other code is byte-for-byte identical to the original.
// =============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JwtVerifyOk = {
  ok: true;
  payload: JwtPayload;
  /** Raw header claims for debugging / audit */
  header: JwtHeader;
};

export type JwtVerifyFail = {
  ok: false;
  reason:
    | 'missing_token'
    | 'malformed_token'
    | 'algorithm_rejected'
    | 'expired'
    | 'not_yet_valid'
    | 'invalid_issuer'
    | 'invalid_audience'
    | 'signature_invalid'
    | 'jwks_fetch_failed'
    | 'no_matching_key'
    | 'internal_error';
  message: string;
};

export type JwtVerifyResult = JwtVerifyOk | JwtVerifyFail;

export interface JwtPayload {
  /** Subject — Supabase user UUID */
  sub: string;
  /** Issued at (epoch seconds) */
  iat: number;
  /** Expiry (epoch seconds) */
  exp: number;
  /** Not before (epoch seconds, optional) */
  nbf?: number;
  /** Issuer */
  iss?: string;
  /** Audience — typically your Supabase project URL */
  aud?: string | string[];
  /** Supabase role — 'authenticated' | 'anon' | 'service_role' */
  role?: string;
  /** User email (if present in token) */
  email?: string;
  /** Custom claims */
  [claim: string]: unknown;
}

export interface JwtHeader {
  alg: string;
  typ?: string;
  /** Key ID — used to select the right JWKS public key */
  kid?: string;
}

// ---------------------------------------------------------------------------
// Internal JWKS types (subset of RFC 7517)
// ---------------------------------------------------------------------------

interface JwkKey {
  kty: string;
  use?: string;
  kid?: string;
  alg?: string;
  n: string;   // RSA modulus (base64url)
  e: string;   // RSA exponent (base64url)
}

interface JwksResponse {
  keys: JwkKey[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Only RS256 is accepted. Rejecting HS256 prevents algorithm confusion attacks. */
const ACCEPTED_ALGORITHMS = ['RS256'] as const;

/** JWKS in-memory cache TTL. Keys rotate rarely; 5 minutes is safe. */
const JWKS_CACHE_TTL_MS = 5 * 60 * 1_000;

/** Clock skew tolerance (seconds). Covers minor server time drift. */
const CLOCK_SKEW_S = 30;

// ---------------------------------------------------------------------------
// JWKS cache (module-level — lives for the isolate lifetime)
// ---------------------------------------------------------------------------

let _jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null;

async function fetchJwks(): Promise<JwkKey[]> {
  const now = Date.now();

  if (_jwksCache && now - _jwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return _jwksCache.keys;
  }

  const jwksUrl = resolveJwksUrl();

  let res: Response;
  try {
    res = await fetch(jwksUrl, {
      headers: { 'Cache-Control': 'no-store' },
      // Timeout via AbortController — JWKS fetch should be fast
      signal: AbortSignal.timeout(5_000),
    });
} catch (err) {

    throw new Error(

      `JWKS fetch network error: ${err instanceof Error ? err.message : String(err)}`,

      { cause: err },

    );

  }
  if (!res.ok) {
    throw new Error(`JWKS fetch failed: HTTP ${res.status} from ${jwksUrl}`);
  }

  let body: JwksResponse;
  try {
    body = (await res.json()) as JwksResponse;
 } catch (err) {

    throw new Error('JWKS response is not valid JSON', { cause: err });

  }

  if (!Array.isArray(body?.keys) || body.keys.length === 0) {
    throw new Error('JWKS response contains no keys');
  }

  _jwksCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

// ---------------------------------------------------------------------------
// Env helpers
// ---------------------------------------------------------------------------

function resolveJwksUrl(): string {
  // Allow explicit override for testing / self-hosted Supabase
  const override = Deno.env.get('SUPABASE_JWKS_URL')?.trim();
  if (override) return override;

  const projectUrl = Deno.env.get('SUPABASE_URL')?.trim();
  if (!projectUrl) {
    throw new Error('[jwt] SUPABASE_URL is not set — cannot derive JWKS URL');
  }

  // Supabase JWKS endpoint: {SUPABASE_URL}/auth/v1/.well-known/jwks.json
  return `${projectUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
}

function resolveExpectedIssuer(): string | null {
  return Deno.env.get('SUPABASE_JWT_ISSUER')?.trim() ?? null;
}

function resolveExpectedAudience(): string | null {
  return Deno.env.get('SUPABASE_JWT_AUDIENCE')?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

// [CHANGE 1] Return type narrowed from Uint8Array to Uint8Array<ArrayBuffer>.
// Uint8Array.from() always allocates a fresh ArrayBuffer — the cast is sound.
// This propagates the narrowed type to the `signature` variable in parseJwt(),
// resolving TS2345 at the crypto.subtle.verify() call site.
function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  // Pad to multiple of 4 and convert base64url → base64
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const paddedLen = padded.length + ((4 - (padded.length % 4)) % 4);
  const b64 = padded.padEnd(paddedLen, '=');
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)) as unknown as Uint8Array<ArrayBuffer>;
}

function base64urlDecodeText(input: string): string {
  return new TextDecoder().decode(base64urlDecode(input));
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

// [CHANGE 2] Added `await` — satisfies deno-lint require-await.
async function importRsaPublicKey(jwk: JwkKey): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: 'RS256',
      use: 'sig',
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

// ---------------------------------------------------------------------------
// Token parsing
// ---------------------------------------------------------------------------

function parseJwt(token: string): {
  header: JwtHeader;
  payload: JwtPayload;
  signingInput: string;
  signature: Uint8Array<ArrayBuffer>;
} | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(base64urlDecodeText(parts[0])) as JwtHeader;
    const payload = JSON.parse(base64urlDecodeText(parts[1])) as JwtPayload;
    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = base64urlDecode(parts[2]);
    return { header, payload, signingInput, signature };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Claim validation
// ---------------------------------------------------------------------------

function validateClaims(
  payload: JwtPayload,
  expectedIssuer: string | null,
  expectedAudience: string | null,
): JwtVerifyFail | null {
  const nowS = Math.floor(Date.now() / 1_000);

  // exp
  if (typeof payload.exp !== 'number' || nowS > payload.exp + CLOCK_SKEW_S) {
    return {
      ok: false,
      reason: 'expired',
      message: `Token expired at ${new Date((payload.exp ?? 0) * 1_000).toISOString()}`,
    };
  }

  // nbf
  if (typeof payload.nbf === 'number' && nowS < payload.nbf - CLOCK_SKEW_S) {
    return {
      ok: false,
      reason: 'not_yet_valid',
      message: `Token not valid until ${new Date(payload.nbf * 1_000).toISOString()}`,
    };
  }

  // iss
  if (expectedIssuer && payload.iss !== expectedIssuer) {
    return {
      ok: false,
      reason: 'invalid_issuer',
      message: `Expected issuer ${expectedIssuer}, got ${payload.iss ?? '(none)'}`,
    };
  }

  // aud
  if (expectedAudience) {
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud ?? ''];
    if (!aud.includes(expectedAudience)) {
      return {
        ok: false,
        reason: 'invalid_audience',
        message: `Expected audience ${expectedAudience}, got ${aud.join(', ')}`,
      };
    }
  }

  return null; // all claims valid
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extracts the Bearer token from an Authorization header.
 * Returns null if the header is absent or malformed.
 */
export function extractBearerToken(req: Request): string | null {
  const raw = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!raw) return null;
  const m = raw.trim().match(/^bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ?? null;
}

/**
 * Verifies a Supabase-issued JWT using the project's JWKS public keys.
 *
 * Algorithm: RS256 only (HS256 rejected).
 * Key source: SUPABASE_URL/auth/v1/.well-known/jwks.json (cached per isolate).
 * Claims verified: exp, nbf, iss (if SUPABASE_JWT_ISSUER set), aud (if SUPABASE_JWT_AUDIENCE set).
 *
 * @param token  Raw JWT string (without "Bearer " prefix)
 */
export async function verifyJwt(token: string): Promise<JwtVerifyResult> {
  // 1. Parse token structure
  const parsed = parseJwt(token);
  if (!parsed) {
    return { ok: false, reason: 'malformed_token', message: 'JWT is not a valid 3-part token' };
  }

  const { header, payload, signingInput, signature } = parsed;

  // 2. Algorithm gate
  if (!ACCEPTED_ALGORITHMS.includes(header.alg as typeof ACCEPTED_ALGORITHMS[number])) {
    return {
      ok: false,
      reason: 'algorithm_rejected',
      message: `Algorithm ${header.alg} is not accepted. Only RS256 is allowed.`,
    };
  }

  // 3. Claim validation (cheap — no crypto yet)
  const claimError = validateClaims(
    payload,
    resolveExpectedIssuer(),
    resolveExpectedAudience(),
  );
  if (claimError) return claimError;

  // 4. Fetch JWKS
  let keys: JwkKey[];
  try {
    keys = await fetchJwks();
  } catch (err) {
    return {
      ok: false,
      reason: 'jwks_fetch_failed',
      message: err instanceof Error ? err.message : 'Unknown JWKS fetch error',
    };
  }

  // 5. Select matching key(s). If kid is present in header, narrow to that key.
  const candidates = header.kid
    ? keys.filter((k) => k.kid === header.kid)
    : keys.filter((k) => k.kty === 'RSA');

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: 'no_matching_key',
      message: `No JWKS key matches kid=${header.kid ?? '(none)'}`,
    };
  }

  // 6. Signature verification — try each candidate key
  const signingBytes = new TextEncoder().encode(signingInput);

  for (const jwk of candidates) {
    try {
      const cryptoKey = await importRsaPublicKey(jwk);
      const valid = await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        signature,
        signingBytes,
      );
      if (valid) {
        return { ok: true, payload, header };
      }
    } catch {
      // This key failed — try next candidate
      continue;
    }
  }

  return {
    ok: false,
    reason: 'signature_invalid',
    message: 'JWT signature verification failed against all JWKS candidates',
  };
}

/**
 * Convenience: verify a JWT from a Request's Authorization header.
 * Returns a 'missing_token' failure if no Bearer token is present.
 */
// [CHANGE 3] Added `await` — satisfies deno-lint require-await.
export async function verifyRequestJwt(req: Request): Promise<JwtVerifyResult> {
  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, reason: 'missing_token', message: 'No Bearer token in Authorization header' };
  }
  return await verifyJwt(token);
}

/**
 * Invalidate the JWKS cache. Useful in tests or after a known key rotation.
 */
export function clearJwksCache(): void {
  _jwksCache = null;
}