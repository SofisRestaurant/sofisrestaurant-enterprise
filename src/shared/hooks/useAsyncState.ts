import { useMemo, useRef, useState } from 'react';

import type { AsyncStatus } from '../types/ui';
import { toError } from '../lib/guards';
import { useMountedRef } from './useMountedRef';
import { useStableCallback } from './useStableCallback';

export interface AsyncState<TData, TError> {
  status: AsyncStatus;
  data: TData | null;
  error: TError | null;
}

export interface UseAsyncStateOptions<TData, TError = Error> {
  initialData?: TData | null;
  preserveDataOnLoad?: boolean;
  mapError?: (error: unknown) => TError;
}

export interface UseAsyncStateReturn<TData, TError> extends AsyncState<TData, TError> {
  isIdle: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  start: () => void;
  succeed: (data: TData) => void;
  fail: (error: TError) => void;
  reset: () => void;
  setData: (data: TData) => void;
  clearError: () => void;
  run: <TResult extends TData>(
    task: Promise<TResult> | (() => Promise<TResult>),
  ) => Promise<TResult>;
}

type ResolvedError<TError> = TError | Error;

export function useAsyncState<TData>(
  options?: UseAsyncStateOptions<TData, Error>,
): UseAsyncStateReturn<TData, Error>;
export function useAsyncState<TData, TError>(
  options: UseAsyncStateOptions<TData, TError> & { mapError: (error: unknown) => TError },
): UseAsyncStateReturn<TData, TError>;
export function useAsyncState<TData, TError>(
  options?: UseAsyncStateOptions<TData, TError>,
): UseAsyncStateReturn<TData, ResolvedError<TError>> {
  const mountedRef = useMountedRef();
  const requestIdRef = useRef(0);

  const initialData = options?.initialData ?? null;
  const preserveDataOnLoad = options?.preserveDataOnLoad ?? true;

  const [state, setState] = useState<AsyncState<TData, ResolvedError<TError>>>({
    status: initialData === null ? 'idle' : 'success',
    data: initialData,
    error: null,
  });

  const normalizeError = useStableCallback((error: unknown): ResolvedError<TError> => {
    if (options?.mapError) {
      return options.mapError(error);
    }

    return toError(error);
  });

  const start = useStableCallback(() => {
    requestIdRef.current += 1;

    setState((current) => ({
      status: 'loading',
      data: preserveDataOnLoad ? current.data : null,
      error: null,
    }));
  });

  const succeed = useStableCallback((data: TData) => {
    requestIdRef.current += 1;

    setState({
      status: 'success',
      data,
      error: null,
    });
  });

  const fail = useStableCallback((error: ResolvedError<TError>) => {
    requestIdRef.current += 1;

    setState((current) => ({
      status: 'error',
      data: current.data,
      error,
    }));
  });

  const reset = useStableCallback(() => {
    requestIdRef.current += 1;

    setState({
      status: initialData === null ? 'idle' : 'success',
      data: initialData,
      error: null,
    });
  });

  const setData = useStableCallback((data: TData) => {
    requestIdRef.current += 1;

    setState({
      status: 'success',
      data,
      error: null,
    });
  });

  const clearError = useStableCallback(() => {
    setState((current) => ({
      ...current,
      error: null,
      status: current.data === null ? 'idle' : current.status === 'error' ? 'success' : current.status,
    }));
  });

  const run = useStableCallback(
    async <TResult extends TData>(
      task: Promise<TResult> | (() => Promise<TResult>),
    ): Promise<TResult> => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setState((current) => ({
        status: 'loading',
        data: preserveDataOnLoad ? current.data : null,
        error: null,
      }));

      try {
        const promise = typeof task === 'function' ? task() : task;
        const data = await promise;

        if (mountedRef.current && requestIdRef.current === requestId) {
          setState({
            status: 'success',
            data,
            error: null,
          });
        }

        return data;
      } catch (error) {
  const normalizedError = normalizeError(error);

  if (mountedRef.current && requestIdRef.current === requestId) {
    setState((current) => ({
      status: 'error',
      data: current.data,
      error: normalizedError,
    }));
  }

  throw toError(normalizedError);
}
    },
  );

  return useMemo(
    () => ({
      ...state,
      isIdle: state.status === 'idle',
      isLoading: state.status === 'loading',
      isSuccess: state.status === 'success',
      isError: state.status === 'error',
      start,
      succeed,
      fail,
      reset,
      setData,
      clearError,
      run,
    }),
    [clearError, fail, reset, run, setData, start, state, succeed],
  );
}