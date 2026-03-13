import type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  NonEmptyArray,
  UnknownRecord,
} from '../types/common';

export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isFunction<TArgs extends readonly unknown[] = readonly unknown[], TReturn = unknown>(
  value: unknown,
): value is (...args: TArgs) => TReturn {
  return typeof value === 'function';
}

export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasOwnKey<TKey extends string>(
  value: unknown,
  key: TKey,
): value is Record<TKey, unknown> {
  return isRecord(value) && Object.prototype.hasOwnProperty.call(value, key);
}

export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

export function isNonEmptyArray<T>(value: unknown): value is NonEmptyArray<T> {
  return Array.isArray(value) && value.length > 0;
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

export function isJsonPrimitive(value: unknown): value is JsonPrimitive {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

export function isJsonArray(value: unknown): value is JsonArray {
  return Array.isArray(value) && value.every(isJsonValue);
}

export function isJsonObject(value: unknown): value is JsonObject {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(isJsonValue);
}

export function isJsonValue(value: unknown): value is JsonValue {
  return isJsonPrimitive(value) || isJsonArray(value) || isJsonObject(value);
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function isIsoDateString(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    ISO_DATE_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  );
}

export function isIsoDateTimeString(value: unknown): value is string {
  return (
    isNonEmptyString(value) &&
    ISO_DATE_TIME_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isErrorLike(value: unknown): value is { message: string } {
  return value instanceof Error || (isRecord(value) && typeof value.message === 'string');
}

export function isAbortError(value: unknown): boolean {
  if (value instanceof DOMException) {
    return value.name === 'AbortError';
  }

  return isRecord(value) && typeof value.name === 'string' && value.name === 'AbortError';
}

export function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return (
    (isRecord(value) || isFunction(value)) &&
    'then' in value &&
    typeof value.then === 'function'
  );
}

export function toError(value: unknown, fallbackMessage = 'Unexpected error'): Error {
  if (value instanceof Error) {
    return value;
  }

  if (isNonEmptyString(value)) {
    return new Error(value);
  }

  if (isRecord(value) && typeof value.message === 'string' && value.message.trim().length > 0) {
    return new Error(value.message);
  }

  return new Error(fallbackMessage);
}