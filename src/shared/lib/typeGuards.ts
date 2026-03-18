import { JsonRecord } from '@/shared/types/json.types';

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}