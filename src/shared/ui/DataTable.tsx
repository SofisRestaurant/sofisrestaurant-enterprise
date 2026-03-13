import { useMemo, useState } from 'react';
import type { ComponentPropsWithoutRef, KeyboardEvent, ReactNode } from 'react';
import clsx from 'clsx';

import type {
  DataTableColumn,
  DataTableSortState,
  TableAlign,
  TableSortValue,
} from '../types/ui';
import { PageState } from './PageState';

export interface DataTableProps<TItem> extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  'aria-label'?: string;
  caption?: string;
  columns: readonly DataTableColumn<TItem>[];
  rows: readonly TItem[];
  getRowKey: (row: TItem, index: number) => string;
  loading?: boolean;
  loadingRowCount?: number;
  dense?: boolean;
  stickyHeader?: boolean;
  initialSort?: DataTableSortState | null;
  sort?: DataTableSortState | null;
  onSortChange?: (sort: DataTableSortState | null) => void;
  onRowClick?: (row: TItem, index: number) => void;
  getRowAriaLabel?: (row: TItem, index: number) => string;
  rowActions?: (row: TItem, index: number) => ReactNode;
  rowClassName?: (row: TItem, index: number) => string | undefined;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
}

function alignToClass(align: TableAlign | undefined): string {
  switch (align) {
    case 'center':
      return 'text-center';
    case 'right':
      return 'text-right';
    case 'left':
    default:
      return 'text-left';
  }
}

function alignToJustifyClass(align: TableAlign | undefined): string {
  switch (align) {
    case 'center':
      return 'justify-center';
    case 'right':
      return 'justify-end';
    case 'left':
    default:
      return 'justify-start';
  }
}

function normalizeSortValue(value: TableSortValue): number | string {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (typeof value === 'number') {
    return value;
  }

  return value?.toString().toLocaleLowerCase() ?? '';
}

function compareSortValues(left: TableSortValue, right: TableSortValue): number {
  const normalizedLeft = normalizeSortValue(left);
  const normalizedRight = normalizeSortValue(right);

  if (typeof normalizedLeft === 'number' && typeof normalizedRight === 'number') {
    return normalizedLeft - normalizedRight;
  }

  return normalizedLeft
    .toString()
    .localeCompare(normalizedRight.toString(), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
}

function nextSortState(
  current: DataTableSortState | null,
  columnKey: string,
): DataTableSortState | null {
  if (current === null || current.columnKey !== columnKey) {
    return { columnKey, direction: 'asc' };
  }

  if (current.direction === 'asc') {
    return { columnKey, direction: 'desc' };
  }

  return null;
}

function buildLoadingRowIds(total: number): string[] {
  return Array.from({ length: total }, (_, index) => `loading-row-${index + 1}`);
}

export function DataTable<TItem>({
  'aria-label': ariaLabel = 'Data table',
  caption,
  columns,
  rows,
  getRowKey,
  loading = false,
  loadingRowCount = 6,
  dense = false,
  stickyHeader = false,
  initialSort = null,
  sort,
  onSortChange,
  onRowClick,
  getRowAriaLabel,
  rowActions,
  rowClassName,
  emptyTitle = 'No results found',
  emptyDescription = 'There are no rows to display for the current view.',
  emptyAction,
  className,
  style,
  ...rest
}: DataTableProps<TItem>) {
  const [internalSort, setInternalSort] = useState<DataTableSortState | null>(initialSort);
  const activeSort = sort === undefined ? internalSort : sort;
  const hasActionColumn = Boolean(rowActions);
  const loadingRowsTotal = Math.max(1, loadingRowCount);
  const cellPaddingClass = dense ? 'px-4 py-2.5' : 'px-4 py-3.5';
  const firstColumnKey = columns[0]?.key ?? null;

  const loadingRowIds = useMemo(() => buildLoadingRowIds(loadingRowsTotal), [loadingRowsTotal]);

  const resolvedRows = useMemo(() => {
    const indexedRows = rows.map((row, index) => ({ row, index }));

    if (activeSort === null) {
      return indexedRows;
    }

    const activeColumn = columns.find(
      (column) =>
        column.key === activeSort.columnKey && Boolean(column.sortable) && Boolean(column.sortValue),
    );

    if (activeColumn === undefined || activeColumn.sortValue === undefined) {
      return indexedRows;
    }

    const sortValue = activeColumn.sortValue;

    return [...indexedRows].sort((left, right) => {
      const comparison = compareSortValues(
        sortValue(left.row, left.index),
        sortValue(right.row, right.index),
      );

      if (comparison !== 0) {
        return activeSort.direction === 'asc' ? comparison : -comparison;
      }

      return left.index - right.index;
    });
  }, [activeSort, columns, rows]);

  const handleSortToggle = (column: DataTableColumn<TItem>) => {
    if (!column.sortable || !column.sortValue) {
      return;
    }

    const next = nextSortState(activeSort, column.key);

    if (sort === undefined) {
      setInternalSort(next);
    }

    onSortChange?.(next);
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLTableRowElement>,
    row: TItem,
    index: number,
  ) => {
    if (!onRowClick) {
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onRowClick(row, index);
    }
  };

  if (columns.length === 0) {
    return (
      <div
        className={clsx(
          'overflow-hidden rounded-2xl border border-zinc-800 bg-[#050509] shadow-[0_0_0_1px_rgba(15,23,42,0.9)]',
          className,
        )}
        style={style}
        {...rest}
      >
        <PageState
          variant={loading ? 'loading' : 'empty'}
          title={loading ? 'Loading table' : 'No columns configured'}
          description={
            loading
              ? 'Preparing table structure.'
              : 'Add at least one column before rendering DataTable.'
          }
          minHeight={220}
        />
      </div>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <div
        className={clsx(
          'overflow-hidden rounded-2xl border border-zinc-800 bg-[#050509] shadow-[0_0_0_1px_rgba(15,23,42,0.9)]',
          className,
        )}
        style={style}
        {...rest}
      >
        <PageState
          variant="empty"
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
          minHeight={240}
        />
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'overflow-hidden rounded-2xl border border-zinc-800 bg-[#050509] shadow-[0_0_0_1px_rgba(15,23,42,0.9)]',
        className,
      )}
      style={style}
      {...rest}
    >
      <div className="overflow-x-auto">
        <table
          className="min-w-full border-separate border-spacing-0 text-sm text-zinc-200"
          aria-label={ariaLabel}
          aria-busy={loading || undefined}
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}

          <thead className="bg-zinc-950/90 text-xs uppercase tracking-[0.16em] text-zinc-400">
            <tr>
              {columns.map((column) => {
                const isSortable = Boolean(column.sortable && column.sortValue);
                const isActiveSort = activeSort?.columnKey === column.key;
                const visibilityClass = column.hideOnMobile ? 'hidden sm:table-cell' : '';
                const ariaSort =
                  isSortable && isActiveSort
                    ? activeSort?.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : isSortable
                      ? 'none'
                      : undefined;

                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={ariaSort}
                    className={clsx(
                      cellPaddingClass,
                      alignToClass(column.align),
                      visibilityClass,
                      column.headerClassName,
                      stickyHeader && 'sticky top-0 z-10 bg-zinc-950/95 backdrop-blur',
                    )}
                    style={{ width: column.width }}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        className={clsx(
                          'inline-flex w-full items-center gap-2 font-semibold text-zinc-300 transition hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509]',
                          alignToJustifyClass(column.align),
                        )}
                        onClick={() => handleSortToggle(column)}
                        aria-label={`Sort by ${typeof column.header === 'string' ? column.header : column.key}`}
                      >
                        <span>{column.header}</span>
                        <span className="text-[10px] text-zinc-500" aria-hidden="true">
                          {isActiveSort ? (activeSort?.direction === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      <span className="font-semibold text-zinc-300">{column.header}</span>
                    )}
                  </th>
                );
              })}

              {hasActionColumn ? (
                <th
                  scope="col"
                  className={clsx(
                    cellPaddingClass,
                    'w-px text-right',
                    stickyHeader && 'sticky top-0 z-10 bg-zinc-950/95 backdrop-blur',
                  )}
                >
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>

          {loading ? (
            <tbody>
              {loadingRowIds.map((loadingRowId) => (
                <tr key={loadingRowId} className="border-t border-zinc-800/70">
                  {columns.map((column) => {
                    const visibilityClass = column.hideOnMobile ? 'hidden sm:table-cell' : '';
                    const cellClassName = clsx(
                      cellPaddingClass,
                      visibilityClass,
                      column.className,
                      alignToClass(column.align),
                    );
                    const cellKey = `${loadingRowId}-${column.key}`;
                    const isFirstColumn = column.key === firstColumnKey;

                    if (isFirstColumn) {
                      return (
                        <th
                          key={cellKey}
                          scope="row"
                          className={clsx(cellClassName, 'font-medium text-zinc-100')}
                          style={{ width: column.width }}
                        >
                          <div className="h-4 w-4/5 animate-pulse rounded bg-zinc-800/70" />
                        </th>
                      );
                    }

                    return (
                      <td key={cellKey} className={cellClassName} style={{ width: column.width }}>
                        <div className="h-4 w-full animate-pulse rounded bg-zinc-800/70" />
                      </td>
                    );
                  })}

                  {hasActionColumn ? (
                    <td className={clsx(cellPaddingClass, 'text-right')}>
                      <div className="ml-auto h-8 w-20 animate-pulse rounded-xl bg-zinc-800/70" />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          ) : (
            <tbody className="divide-y divide-zinc-800/70">
              {resolvedRows.map(({ row, index }) => {
                const clickable = Boolean(onRowClick);

                return (
                  <tr
                    key={getRowKey(row, index)}
                    className={clsx(
                      'align-top',
                      clickable &&
                        'cursor-pointer transition-colors hover:bg-white/0.03 focus-within:bg-white/0.04',
                      rowClassName?.(row, index),
                    )}
                    onClick={clickable ? () => onRowClick?.(row, index) : undefined}
                    onKeyDown={clickable ? (event) => handleRowKeyDown(event, row, index) : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    aria-label={clickable ? getRowAriaLabel?.(row, index) : undefined}
                  >
                    {columns.map((column) => {
                      const visibilityClass = column.hideOnMobile ? 'hidden sm:table-cell' : '';
                      const content = column.cell(row, index);
                      const commonClassName = clsx(
                        cellPaddingClass,
                        visibilityClass,
                        column.className,
                        alignToClass(column.align),
                      );
                      const isFirstColumn = column.key === firstColumnKey;

                      if (isFirstColumn) {
                        return (
                          <th
                            key={column.key}
                            scope="row"
                            className={clsx(commonClassName, 'font-medium text-zinc-100')}
                            style={{ width: column.width }}
                          >
                            {content}
                          </th>
                        );
                      }

                      return (
                        <td key={column.key} className={commonClassName} style={{ width: column.width }}>
                          {content}
                        </td>
                      );
                    })}

                    {hasActionColumn ? (
                      <td className={clsx(cellPaddingClass, 'text-right')}>
                        <div
                          className="inline-flex items-center justify-end"
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {rowActions?.(row, index)}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}