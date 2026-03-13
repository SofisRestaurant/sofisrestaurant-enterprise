import { useMemo, useRef, useState, type DragEvent } from 'react';
import clsx from 'clsx';
import type { AdminModifierGroup } from '@/types/admin-menu';

export interface ModifierGroupReorderListProps {
  groups: AdminModifierGroup[];
  disabled?: boolean;
  /** Called after every successful drop with the reordered array */
  onReorder: (reordered: AdminModifierGroup[]) => void;
}

export function ModifierGroupReorderList({
  groups,
  disabled = false,
  onReorder,
}: ModifierGroupReorderListProps) {
  const dragIndex = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  // keep stable array reference for drag operations
  const list = useMemo(() => groups, [groups]);

  function handleDragStart(i: number) {
    if (disabled) return;
    dragIndex.current = i;
    setDraggingIdx(i);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, i: number) {
    if (disabled) return;
    e.preventDefault();
    if (dragIndex.current === null || dragIndex.current === i) return;

    const next = [...list];
    const [item] = next.splice(dragIndex.current, 1);
    next.splice(i, 0, item);
    dragIndex.current = i;
    onReorder(next);
  }

  function handleDragEnd() {
    dragIndex.current = null;
    setDraggingIdx(null);
  }

  return (
    <div className="space-y-2">
      {list.map((g, i) => (
        <div
          key={g.id}
          draggable={!disabled}
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDragEnd={handleDragEnd}
          className={clsx(
            'flex items-center justify-between rounded-xl border px-3 py-2.5',
            'border-zinc-800 bg-zinc-900/40',
            disabled ? 'opacity-60' : 'cursor-move',
            draggingIdx === i ? 'ring-1 ring-amber-500/40' : '',
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-zinc-200">{g.name}</p>
            <p className="text-[11px] text-zinc-500">
              {g.required ? 'Required' : 'Optional'} • min {g.min_selections} •{' '}
              {g.max_selections == null ? 'max ∞' : `max ${g.max_selections}`}
            </p>
          </div>

          <div className="font-mono text-[10px] text-zinc-600">⋮⋮</div>
        </div>
      ))}
    </div>
  );
}
