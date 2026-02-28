// src/components/ui/ConfirmDialog.tsx
// ============================================================================
// CONFIRM DIALOG
// ============================================================================
// Accessible confirmation dialog for destructive actions.
// Follows ModalShell's focus-trap and keyboard patterns.
// Used by: delete group, delete modifier, force-delete with linked items.
// ============================================================================

import { useEffect, useRef } from 'react'
import { AsyncButton }       from './AsyncButton'

interface ConfirmDialogProps {
  isOpen:     boolean
  onConfirm:  () => void
  onCancel:   () => void
  title:      string
  message:    string
  confirmText?: string
  cancelText?:  string
  variant?:   'danger' | 'warning' | 'default'
  loading?:   boolean
}

export function ConfirmDialog({
  isOpen,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText  = 'Cancel',
  variant     = 'danger',
  loading     = false,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel button on open (safer default for destructive dialogs)
  useEffect(() => {
    if (isOpen) cancelRef.current?.focus()
  }, [isOpen])

  // Escape to cancel
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const iconMap = {
    danger:  { bg: 'bg-red-50',    icon: '⚠',  ring: 'ring-red-100',  confirmVariant: 'danger'    as const },
    warning: { bg: 'bg-amber-50',  icon: '⚠',  ring: 'ring-amber-100', confirmVariant: 'primary'   as const },
    default: { bg: 'bg-gray-50',   icon: 'ℹ',  ring: 'ring-gray-100',  confirmVariant: 'primary'   as const },
  }
  const style = iconMap[variant]

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Dialog */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        className="fixed inset-0 z-[10000] flex items-center justify-center px-4"
      >
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-[modalCardIn_0.22s_ease_both]">
          {/* Icon */}
          <div className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${style.bg} ring-8 ${style.ring} text-2xl`}>
            {style.icon}
          </div>

          <h2 id="confirm-title" className="text-center text-lg font-bold text-gray-900 mb-2">
            {title}
          </h2>
          <p id="confirm-message" className="text-center text-sm text-gray-500 mb-6 leading-relaxed">
            {message}
          </p>

          <div className="flex gap-3">
            <button
              ref={cancelRef}
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-40"
            >
              {cancelText}
            </button>
            <AsyncButton
              variant={style.confirmVariant}
              loading={loading}
              onClick={onConfirm}
              className="flex-1"
            >
              {confirmText}
            </AsyncButton>
          </div>
        </div>
      </div>
    </>
  )
}