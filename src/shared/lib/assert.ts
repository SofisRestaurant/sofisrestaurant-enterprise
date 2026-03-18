import { isNonEmptyString, isRecord } from './guards';

export class AssertionError extends Error {
  public constructor(message = 'Assertion failed') {
    super(message);
    this.name = 'AssertionError';
  }
}

export function invariant(condition: unknown, message = 'Invariant violation'): asserts condition {
  if (!condition) {
    throw new AssertionError(message);
  }
}

export function assertDefined<T>(
  value: T,
  message = 'Expected value to be defined',
): asserts value is NonNullable<T> {
  if (value === null || value === undefined) {
    throw new AssertionError(message);
  }
}

export function assertNonEmptyString(
  value: unknown,
  message = 'Expected a non-empty string',
): asserts value is string {
  if (!isNonEmptyString(value)) {
    throw new AssertionError(message);
  }
}

export function assertFiniteNumber(
  value: unknown,
  message = 'Expected a finite number',
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AssertionError(message);
  }
}

export function assertRecord(
  value: unknown,
  message = 'Expected an object record',
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw new AssertionError(message);
  }
}

export function assertArray<T>(
  value: unknown,
  message = 'Expected an array',
): asserts value is readonly T[] {
  if (!Array.isArray(value)) {
    throw new AssertionError(message);
  }
}

export function assertNonEmptyArray<T>(
  value: unknown,
  message = 'Expected a non-empty array',
): asserts value is readonly [T, ...T[]] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AssertionError(message);
  }
}

export function assertNever(value: never, message?: string): never {
  throw new AssertionError(message ?? `Unexpected value: ${String(value)}`);
}