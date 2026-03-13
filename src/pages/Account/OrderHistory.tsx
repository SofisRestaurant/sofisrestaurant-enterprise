// src/pages/Account/OrderHistory.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useUserContext } from '@/contexts/useUserContext';
import { Spinner } from '@/components/ui/Spinner';
import { fetchOrdersByCustomer, type OrderRow } from '@/modules/orders/api/orders.customer.api';

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to load order history.';
}

function getPageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 0) {
    return [];
  }

  const pages = new Set<number>([
    0,
    1,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    totalPages - 2,
    totalPages - 1,
  ]);

  return [...pages]
    .filter((pageNumber) => pageNumber >= 0 && pageNumber < totalPages)
    .sort((left, right) => left - right);
}

export default function OrderHistory() {
  const { user } = useUserContext();
  const userId = user?.id ?? null;

  const PAGE_SIZE = 10;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pageChanging, setPageChanging] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  const [hasPreviousPage, setHasPreviousPage] = useState<boolean>(false);

  const hasLoadedOnceRef = useRef<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const run = async (): Promise<void> => {
      if (userId === null) {
        if (mounted) {
          setOrders([]);
          setTotalCount(0);
          setTotalPages(0);
          setHasNextPage(false);
          setHasPreviousPage(false);
          setLoading(false);
          setPageChanging(false);
          setError(null);
          hasLoadedOnceRef.current = false;
        }
        return;
      }

      if (mounted) {
        if (hasLoadedOnceRef.current) {
          setPageChanging(true);
        } else {
          setLoading(true);
        }

        setError(null);
      }

      try {
        const result = await fetchOrdersByCustomer({
          customerUid: userId,
          page,
          pageSize: PAGE_SIZE,
          includeUnpaid: false,
        });

        if (!mounted) {
          return;
        }

        setOrders(result.rows);
        setTotalCount(result.count);
        setTotalPages(result.totalPages);
        setHasNextPage(result.hasNextPage);
        setHasPreviousPage(result.hasPreviousPage);
        hasLoadedOnceRef.current = true;
      } catch (loadError: unknown) {
        if (!mounted) {
          return;
        }

        setError(getErrorMessage(loadError));
      } finally {
        if (mounted) {
          setLoading(false);
          setPageChanging(false);
        }
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [userId, page]);

  const pageNumbers = useMemo(() => getPageNumbers(page, totalPages), [page, totalPages]);

  if (userId === null) {
    return <div className="text-sm text-gray-600">Please sign in.</div>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Order History</h1>
          <p className="mt-1 text-sm text-gray-600">Your recent orders and payment status.</p>
        </div>

        <div className="text-sm text-gray-500">
          {totalCount} total {totalCount === 1 ? 'order' : 'orders'}
        </div>
      </div>

      {error !== null ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {orders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
          No orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orders.map((order) => (
                  <tr key={order.id} className="bg-white">
                    <td className="px-4 py-3 text-gray-900">
                      {new Date(order.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{order.order_type}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatMoney(order.amount_total, order.currency)}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{order.payment_status}</td>
                    <td className="px-4 py-3 text-gray-700">{order.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-600">
                Showing page {page + 1} of {totalPages}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPage(0);
                  }}
                  disabled={!hasPreviousPage || pageChanging}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  First
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPage((currentPage) => Math.max(currentPage - 1, 0));
                  }}
                  disabled={!hasPreviousPage || pageChanging}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {pageNumbers.map((pageNumber, index) => {
                    const previousPageNumber = index > 0 ? pageNumbers[index - 1] : null;
                    const showGap =
                      previousPageNumber !== null && pageNumber - previousPageNumber > 1;

                    return (
                      <div key={`page-group-${pageNumber}`} className="flex items-center gap-2">
                        {showGap ? <span className="px-1 text-sm text-gray-400">…</span> : null}
                        <button
                          type="button"
                          onClick={() => {
                            setPage(pageNumber);
                          }}
                          aria-current={page === pageNumber ? 'page' : undefined}
                          disabled={pageChanging}
                          className={[
                            'min-w-40px rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40',
                            page === pageNumber
                              ? 'border-gray-900 bg-gray-900 text-white'
                              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                          ].join(' ')}
                        >
                          {pageNumber + 1}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setPage((currentPage) =>
                      currentPage + 1 < totalPages ? currentPage + 1 : currentPage,
                    );
                  }}
                  disabled={!hasNextPage || pageChanging}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPage(Math.max(totalPages - 1, 0));
                  }}
                  disabled={!hasNextPage || pageChanging}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Last
                </button>
              </div>
            </div>
          ) : null}

          {pageChanging ? (
            <div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
              Loading next page…
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}