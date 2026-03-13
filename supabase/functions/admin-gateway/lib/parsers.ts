// =============================================================================
// PATH: supabase/functions/admin-gateway/lib/parsers.ts
// =============================================================================
// Backwards-compatible re-export shim.
// All parsing logic now lives in ./parsers/ — this file exists so any existing
// import of '../lib/parsers.ts' continues to resolve without changes.
// =============================================================================

export { parseGatewayRequest } from './parsers/index.ts';