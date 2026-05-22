// src/lib/runtime/chunkLoadRecovery.ts
// -----------------------------------------------------------------------------
// Handles stale Vite/Vercel lazy-loaded chunks after a new deploy.
//
// Why this exists:
// If a customer keeps the app open during a deployment, their browser may still
// reference an old hashed JS file that no longer exists, such as:
// /assets/LoginModal-CdJFvyn9.js
//
// When that happens, React lazy routes/modals can fail with:
// "Failed to fetch dynamically imported module"
//
// This helper safely reloads the page once so the browser receives the newest
// asset manifest. It never reloads for normal app errors.
// -----------------------------------------------------------------------------

const CHUNK_RELOAD_KEY = 'sofis:chunk-reload-attempted';
const CHUNK_RELOAD_REASON_KEY = 'sofis:chunk-reload-reason';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.toLowerCase();
  }

  if (typeof error === 'string') {
    return error.toLowerCase();
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message.toLowerCase();
  }

  return '';
}

export function isChunkLoadError(error: unknown): boolean {
  const message = getErrorMessage(error);

  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('loading chunk') ||
    message.includes('chunkloaderror') ||
    message.includes('dynamically imported module')
  );
}

export function recoverFromChunkLoadError(error: unknown): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  if (!isChunkLoadError(error)) {
    return false;
  }

  const alreadyTried = window.sessionStorage.getItem(CHUNK_RELOAD_KEY) === 'true';

  if (alreadyTried) {
    return false;
  }

  window.sessionStorage.setItem(CHUNK_RELOAD_KEY, 'true');
  window.sessionStorage.setItem(CHUNK_RELOAD_REASON_KEY, getErrorMessage(error));

  window.location.reload();

  return true;
}

export function clearChunkLoadRecoveryFlag(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  window.sessionStorage.removeItem(CHUNK_RELOAD_REASON_KEY);
}