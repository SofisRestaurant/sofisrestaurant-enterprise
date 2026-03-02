// =============================================================================
// src/features/admin/finance/useFinance.ts
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchFinanceMetrics,
  fetchLedger,
  fetchRefundSummary,
} from '../../../pages/Admin/finance/finance.service'
import type {
  DateRange,
  FinanceMetrics,
  FinancePeriod,
  LedgerRow,
} from '../../../pages/Admin/finance/finance.types'

interface UseFinanceReturn {
  metrics:      FinanceMetrics | null
  ledger:       LedgerRow[]
  refundTotal:  number
  refundCount:  number
  loading:      boolean
  error:        string | null
  period:       FinancePeriod
  setPeriod:    (p: FinancePeriod) => void
  customRange:  DateRange
  setCustomRange: (r: DateRange) => void
  refresh:      () => void
}

function periodToRange(period: FinancePeriod, custom: DateRange): DateRange {
  const now  = new Date()
  const to   = now.toISOString()

  if (period === 'custom') return custom

  const from = new Date(now)
  if (period === 'today')  { from.setHours(0, 0, 0, 0) }
  if (period === 'week')   { from.setDate(from.getDate() - 7) }
  if (period === 'month')  { from.setMonth(from.getMonth() - 1) }

  return { from: from.toISOString(), to }
}

export function useFinance(): UseFinanceReturn {
  const [period,      setPeriod]      = useState<FinancePeriod>('week')
  const [customRange, setCustomRange] = useState<DateRange>({
    from: new Date(Date.now() - 7 * 864e5).toISOString(),
    to:   new Date().toISOString(),
  })
  const [metrics,     setMetrics]     = useState<FinanceMetrics | null>(null)
  const [ledger,      setLedger]      = useState<LedgerRow[]>([])
  const [refundTotal, setRefundTotal] = useState(0)
  const [refundCount, setRefundCount] = useState(0)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)
  const [tick,        setTick]        = useState(0)

  const range = useMemo(() => periodToRange(period, customRange), [period, customRange])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [m, l, r] = await Promise.all([
        fetchFinanceMetrics(range),
        fetchLedger(range),
        fetchRefundSummary(range),
      ])
      setMetrics(m)
      setLedger(l)
      setRefundTotal(r.totalCents)
      setRefundCount(r.count)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Finance data failed to load')
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { void load() }, [load, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])

  return {
    metrics,
    ledger,
    refundTotal,
    refundCount,
    loading,
    error,
    period,
    setPeriod,
    customRange,
    setCustomRange,
    refresh,
  }
}