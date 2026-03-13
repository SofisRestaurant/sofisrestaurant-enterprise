import type { ReactNode } from 'react';

import type { SortDirection } from './common';

export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';
export type FormStatus = 'idle' | 'submitting' | 'success' | 'error';
export type TableAlign = 'left' | 'center' | 'right';
export type TableSortValue = string | number | boolean | Date | null | undefined;
export type PageStateVariant = 'loading' | 'empty' | 'error';

export interface SelectOption<TValue extends string = string> {
  label: string;
  value: TValue;
  description?: string;
  disabled?: boolean;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface PageStateAction {
  label: string;
  onAction: () => void;
  disabled?: boolean;
}

export interface AsyncValue<TData, TError = string> {
  status: AsyncStatus;
  data: TData | null;
  error: TError | null;
}

export interface DataTableSortState<TColumnKey extends string = string> {
  columnKey: TColumnKey;
  direction: SortDirection;
}

export interface DataTableColumn<TItem> {
  key: string;
  header: ReactNode;
  cell: (item: TItem, index: number) => ReactNode;
  sortValue?: (item: TItem, index: number) => TableSortValue;
  align?: TableAlign;
  width?: number | string;
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  hideOnMobile?: boolean;
}

export interface DataTableEmptyState {
  title?: string;
  description?: string;
  action?: ReactNode;
}