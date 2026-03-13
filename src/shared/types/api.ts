import type { PaginationMeta, UnknownRecord } from './common';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable_entity'
  | 'unsupported_media_type'
  | 'rate_limited'
  | 'server_error'
  | 'network_error'
  | 'unknown_error'
  | (string & {});

export interface ApiError<TCode extends string = ApiErrorCode> {
  code: TCode;
  message: string;
  status: number;
  details?: unknown;
  requestId?: string;
}

export interface ApiMeta extends UnknownRecord {
  requestId?: string;
  receivedAt?: string;
}

export interface ApiSuccess<TData> {
  ok: true;
  data: TData;
  meta?: ApiMeta;
}

export interface ApiFailure<TCode extends string = ApiErrorCode> {
  ok: false;
  error: ApiError<TCode>;
  meta?: ApiMeta;
}

export type ApiResponse<TData, TCode extends string = ApiErrorCode> =
  | ApiSuccess<TData>
  | ApiFailure<TCode>;

export interface ApiListData<TItem> {
  items: readonly TItem[];
  pagination: PaginationMeta;
}

export type ApiListResponse<TItem, TCode extends string = ApiErrorCode> = ApiResponse<
  ApiListData<TItem>,
  TCode
>;

export interface InvokeEdgeError {
  status: number;
  message: string;
  details?: unknown;
}

export interface RequestHeaders {
  readonly [key: string]: string;
}

export interface ApiRequestOptions<TBody = UnknownRecord> {
  method?: ApiMethod;
  headers?: RequestHeaders;
  body?: TBody;
  signal?: AbortSignal;
  skipAuth?: boolean;
}

export interface ResourceEnvelope<TResource> {
  item: TResource;
}

export interface CollectionEnvelope<TItem> {
  items: readonly TItem[];
  pagination?: PaginationMeta;
}

export function isApiSuccess<TData, TCode extends string = ApiErrorCode>(
  response: ApiResponse<TData, TCode>,
): response is ApiSuccess<TData> {
  return response.ok;
}

export function isApiFailure<TData, TCode extends string = ApiErrorCode>(
  response: ApiResponse<TData, TCode>,
): response is ApiFailure<TCode> {
  return !response.ok;
}