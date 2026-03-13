// supabase/functions/_shared/json.ts
import type { Json } from './database.types.ts';

export function toJson(value: unknown, fallback: Json = null): Json {
  if (value === undefined) return fallback;
  if (value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return fallback;
  }
}
