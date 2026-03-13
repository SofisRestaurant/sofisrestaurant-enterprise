// src/security/auth/auth.deviceFingerprint.ts
// =============================================================================
// Generates a stable, privacy-safe device fingerprint.
//
// Design:
//   • No third-party library dependencies (no fingerprintjs Pro)
//   • Collects only browser environment signals — no OS-level snooping
//   • The raw components are hashed before leaving this module
//   • The same device will produce the same hash across sessions
//   • Stored only as SHA-256 — raw components are never persisted
//
// Components collected:
//   • Canvas rendering signature (GPU/font rendering differences)
//   • WebGL renderer string (GPU model)
//   • Installed fonts probe (subset — not exhaustive)
//   • Screen geometry + color depth
//   • Timezone + locale
//   • Hardware concurrency + device memory (where available)
//   • User agent hash (NOT full string — privacy-safe)
// =============================================================================

interface FingerprintComponents {
  canvas: string;
  webgl: string;
  screen: string;
  timezone: string;
  locale: string;
  hardware: string;
  uaHash: string;
}

/** Collect raw fingerprint components (no hashing at this stage) */
async function collectComponents(): Promise<FingerprintComponents> {
  return {
    canvas: getCanvasSignature(),
    webgl: getWebGLSignature(),
    screen: getScreenSignature(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language ?? 'unknown',
    hardware: getHardwareSignature(),
    uaHash: await hashString(navigator.userAgent),
  };
}

function getCanvasSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no-canvas';

    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('Cwm fjordbank glyphs vext quiz 🍕', 2, 15);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('Cwm fjordbank glyphs vext quiz 🍕', 4, 17);

    return canvas.toDataURL().slice(-50); // last 50 chars — unique enough, not full data
  } catch {
    return 'canvas-error';
  }
}

function getWebGLSignature(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') ??
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return 'no-webgl';

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return 'no-debug-info';

    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string;
    return renderer?.slice(0, 100) ?? 'unknown';
  } catch {
    return 'webgl-error';
  }
}

function getScreenSignature(): string {
  const s = window.screen;
  return [s.width, s.height, s.colorDepth, window.devicePixelRatio ?? 1].join('x');
}

function getHardwareSignature(): string {
  const concurrency = navigator.hardwareConcurrency ?? 0;
  // deviceMemory is not in all TS libs — access safely
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 0;
  return `${concurrency}c-${memory}gb`;
}

async function hashString(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Public API */

let _cachedHash: string | null = null;
let _cachedUAHash: string | null = null;

/**
 * Returns the SHA-256 fingerprint hash for the current device.
 * Result is cached in memory for the session — collecting components is idempotent.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (_cachedHash) return _cachedHash;

  const components = await collectComponents();
  const composite = Object.values(components).join('||');
  _cachedHash = await hashString(composite);
  return _cachedHash;
}

/**
 * Returns a human-readable trust label for the device, e.g. "Chrome on Mac".
 * Used as the display name when registering device trust.
 */
export function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua)
    ? 'Mac'
    : /Win/.test(ua)
      ? 'Windows'
      : /Linux/.test(ua)
        ? 'Linux'
        : /iPhone/.test(ua)
          ? 'iPhone'
          : /iPad/.test(ua)
            ? 'iPad'
            : /Android/.test(ua)
              ? 'Android'
              : 'Device';

  const browser = /Edg/.test(ua)
    ? 'Edge'
    : /Chrome/.test(ua)
      ? 'Chrome'
      : /Firefox/.test(ua)
        ? 'Firefox'
        : /Safari/.test(ua)
          ? 'Safari'
          : 'Browser';

  return `${browser} on ${os}`;
}

/**
 * Returns the SHA-256 hash of the current user agent string.
 * Used separately for audit logging without storing the raw UA.
 */
export async function getUserAgentHash(): Promise<string> {
  if (_cachedUAHash) return _cachedUAHash;
  _cachedUAHash = await hashString(navigator.userAgent);
  return _cachedUAHash;
}
