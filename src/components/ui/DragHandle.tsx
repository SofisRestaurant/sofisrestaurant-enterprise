// src/components/ui/DragHandle.tsx
// ============================================================================
// DRAG HANDLE
// ============================================================================
// Visual drag indicator used in ModifierReorderList.
// Shows a ⠿ grip pattern on hover. Compatible with HTML5 drag-and-drop.
// ============================================================================

interface DragHandleProps {
  /** Additional classes */
  className?: string
  /** Passed through to the div for drag event binding */
  onMouseDown?: (e: React.MouseEvent) => void
}

export function DragHandle({ className = '', onMouseDown }: DragHandleProps) {
  return (
    <div
      aria-hidden="true"
      title="Drag to reorder"
      onMouseDown={onMouseDown}
      className={[
        'cursor-grab active:cursor-grabbing',
        'flex flex-col items-center justify-center gap-[3px]',
        'px-1 py-2 rounded hover:bg-gray-100 transition text-gray-300 hover:text-gray-500',
        className,
      ].filter(Boolean).join(' ')}
    >
      {/* Two columns of three dots = ⠿ pattern */}
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex gap-[3px]">
          <span className="h-[3px] w-[3px] rounded-full bg-current" />
          <span className="h-[3px] w-[3px] rounded-full bg-current" />
        </div>
      ))}
    </div>
  )
}