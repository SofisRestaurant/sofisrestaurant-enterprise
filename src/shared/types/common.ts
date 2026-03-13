export type Primitive = string | number | boolean | bigint | symbol | null | undefined;
export type Nullish = null | undefined;
export type Maybe<T> = T | Nullish;
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type UnknownRecord = Record<string, unknown>;
export type NonEmptyArray<T> = readonly [T, ...T[]];

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonArray = JsonValue[];

export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export type UUID = Brand<string, 'uuid'>;
export type ISODateString = Brand<string, 'iso-date'>;
export type ISODateTimeString = Brand<string, 'iso-datetime'>;

export type ValueOf<T> = T[keyof T];

export type DeepPartial<T> = T extends Primitive
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly DeepPartial<TItem>[]
    : T extends (infer TItem)[]
      ? DeepPartial<TItem>[]
      : {
          [TKey in keyof T]?: DeepPartial<T[TKey]>;
        };

export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends readonly (infer TItem)[]
    ? readonly DeepReadonly<TItem>[]
    : T extends (infer TItem)[]
      ? readonly DeepReadonly<TItem>[]
      : {
          readonly [TKey in keyof T]: DeepReadonly<T[TKey]>;
        };

export type WithRequired<T, TKeys extends keyof T> = Omit<T, TKeys> & Required<Pick<T, TKeys>>;
export type WithOptional<T, TKeys extends keyof T> = Omit<T, TKeys> & Partial<Pick<T, TKeys>>;

export interface Identifiable<TId extends string = string> {
  id: TId;
}

export interface Timestamped {
  created_at: ISODateTimeString;
  updated_at: ISODateTimeString;
}

export type SortDirection = 'asc' | 'desc';

export interface SortSpec<TField extends string = string> {
  field: TField;
  direction: SortDirection;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginationMeta extends PaginationParams {
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface SearchParams<
  TFilters extends UnknownRecord = UnknownRecord,
  TSortField extends string = string,
> {
  query?: string;
  filters?: TFilters;
  sort?: SortSpec<TSortField>;
  page?: number;
  pageSize?: number;
}

export interface DateRange {
  from?: ISODateString;
  to?: ISODateString;
}