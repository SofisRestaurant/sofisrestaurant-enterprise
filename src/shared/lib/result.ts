import { toError } from './guards';

export interface Ok<TData> {
  ok: true;
  data: TData;
}

export interface Err<TError> {
  ok: false;
  error: TError;
}

export type Result<TData, TError = Error> = Ok<TData> | Err<TError>;

export function ok<TData>(data: TData): Ok<TData> {
  return { ok: true, data };
}

export function err<TError>(error: TError): Err<TError> {
  return { ok: false, error };
}

export function isOk<TData, TError>(result: Result<TData, TError>): result is Ok<TData> {
  return result.ok;
}

export function isErr<TData, TError>(result: Result<TData, TError>): result is Err<TError> {
  return !result.ok;
}

export function mapResult<TData, TError, TNextData>(
  result: Result<TData, TError>,
  mapper: (data: TData) => TNextData,
): Result<TNextData, TError> {
  return result.ok ? ok(mapper(result.data)) : result;
}

export function mapResultError<TData, TError, TNextError>(
  result: Result<TData, TError>,
  mapper: (error: TError) => TNextError,
): Result<TData, TNextError> {
  return result.ok ? result : err(mapper(result.error));
}

export function andThen<TData, TError, TNextData, TNextError = TError>(
  result: Result<TData, TError>,
  mapper: (data: TData) => Result<TNextData, TNextError>,
): Result<TNextData, TError | TNextError> {
  return result.ok ? mapper(result.data) : result;
}

export async function andThenAsync<TData, TError, TNextData, TNextError = TError>(
  result: Result<TData, TError>,
  mapper: (data: TData) => Promise<Result<TNextData, TNextError>>,
): Promise<Result<TNextData, TError | TNextError>> {
  return result.ok ? mapper(result.data) : result;
}

export function matchResult<TData, TError, TReturn>(
  result: Result<TData, TError>,
  branches: {
    ok: (data: TData) => TReturn;
    err: (error: TError) => TReturn;
  },
): TReturn {
  return result.ok ? branches.ok(result.data) : branches.err(result.error);
}

export function unwrapOr<TData, TError>(result: Result<TData, TError>, fallback: TData): TData {
  return result.ok ? result.data : fallback;
}

export function unwrapResult<TData, TError>(result: Result<TData, TError>): TData {
  if (result.ok) {
    return result.data;
  }

  throw result.error instanceof Error ? result.error : toError(result.error);
}

export function tapResult<TData, TError>(
  result: Result<TData, TError>,
  handlers?: {
    ok?: (data: TData) => void;
    err?: (error: TError) => void;
  },
): Result<TData, TError> {
  if (result.ok) {
    handlers?.ok?.(result.data);
  } else {
    handlers?.err?.(result.error);
  }

  return result;
}

export function allResults<TData, TError>(
  results: readonly Result<TData, TError>[],
): Result<TData[], TError> {
  const collected: TData[] = [];

  for (const result of results) {
    if (!result.ok) {
      return result;
    }

    collected.push(result.data);
  }

  return ok(collected);
}

export function fromThrowable<TData>(operation: () => TData): Result<TData, Error>;
export function fromThrowable<TData, TError>(
  operation: () => TData,
  mapError: (error: unknown) => TError,
): Result<TData, TError>;
export function fromThrowable<TData, TError>(
  operation: () => TData,
  mapError?: (error: unknown) => TError,
): Result<TData, TError | Error> {
  try {
    return ok(operation());
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }

    return err(toError(error));
  }
}

export async function fromPromise<TData>(promise: Promise<TData>): Promise<Result<TData, Error>>;
export async function fromPromise<TData, TError>(
  promise: Promise<TData>,
  mapError: (error: unknown) => TError,
): Promise<Result<TData, TError>>;
export async function fromPromise<TData, TError>(
  promise: Promise<TData>,
  mapError?: (error: unknown) => TError,
): Promise<Result<TData, TError | Error>> {
  try {
    return ok(await promise);
  } catch (error) {
    if (mapError) {
      return err(mapError(error));
    }

    return err(toError(error));
  }
}