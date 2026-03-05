import { useMemo } from 'react'
import { Search } from 'lucide-react'

type Props = {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
}

export default function MenuHeaderSearch({
  value,
  onChange,
  placeholder = 'Search menu…',
  disabled = false,
}: Props) {
  const hasValue = useMemo(() => value.trim().length > 0, [value])

  return (
    <div className="w-full max-w-xl">
      <label className="sr-only" htmlFor="menu-header-search">
        Search menu
      </label>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
          aria-hidden="true"
        />
        <input
          id="menu-header-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className={[
            'h-10 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 shadow-sm',
            'placeholder:text-zinc-400 outline-none',
            'focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:border-amber-500/30',
            disabled ? 'opacity-60' : '',
            hasValue ? '' : '',
          ].join(' ')}
        />
      </div>
    </div>
  )
}