// src/components/menu/MenuItemModal.tsx

import { useState, useMemo } from 'react'
import type {
  MenuItem,
  ModifierGroup,
  SelectedModifier,
  CartItemModifier,
} from '@/types/menu'

interface MenuItemModalProps {
  item: MenuItem
  onClose: () => void
  onAddToCart: (itemData: {
    item_id: string
    name: string
    quantity: number
    base_price: number
    modifiers: CartItemModifier[]
    subtotal: number
    special_instructions?: string
  }) => void
}

export default function MenuItemModal({
  item,
  onClose,
  onAddToCart,
}: MenuItemModalProps) {
  /* ================= STATE ================= */
  const modifierGroups = item.modifier_groups ?? [];
  const [quantity, setQuantity] = useState(1)
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [selectedModifiers, setSelectedModifiers] =
    useState<Record<string, SelectedModifier[]>>({})
  const [errors, setErrors] =
    useState<Record<string, string>>({})

  /* ================= DERIVED ================= */

  const isLowStock =
    item.inventory_count &&
    item.low_stock_threshold &&
    item.inventory_count <= item.low_stock_threshold

  const total = useMemo(() => {
    let base = item.price

    Object.values(selectedModifiers).forEach((mods) => {
      mods.forEach((mod) => {
        base += mod.price_adjustment
      })
    })

    return base * quantity
  }, [item.price, selectedModifiers, quantity])

  /* ================= HANDLERS ================= */

  const handleModifierSelection = (
    group: ModifierGroup,
    modifier: SelectedModifier
  ) => {
    setSelectedModifiers((prev) => {
      const current = prev[group.id] || []

      if (group.type === 'radio') {
        return { ...prev, [group.id]: [modifier] }
      }

      if (group.type === 'checkbox') {
        const exists = current.some((m) => m.id === modifier.id)

        if (exists) {
          return {
            ...prev,
            [group.id]: current.filter((m) => m.id !== modifier.id),
          }
        }

        if (
          group.max_selections &&
          current.length >= group.max_selections
        ) {
          setErrors((e) => ({
            ...e,
            [group.id]: `Maximum ${group.max_selections} selections`,
          }))
          return prev
        }

        return {
          ...prev,
          [group.id]: [...current, modifier],
        }
      }

      return prev
    })

    setErrors((e) => ({ ...e, [group.id]: '' }))
  }

  const validateSelections = () => {
    const newErrors: Record<string, string> = {}

    item.modifier_groups?.forEach((group) => {
      const selections = selectedModifiers[group.id] || []

      if (group.required && selections.length === 0) {
        newErrors[group.id] = 'This selection is required'
      }

      if (
        group.min_selections &&
        selections.length < group.min_selections
      ) {
        newErrors[group.id] = `Please select at least ${group.min_selections}`
      }
    })

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleAddToCart = () => {
    if (!validateSelections()) return

    const modifiers: CartItemModifier[] =
      item.modifier_groups
        ?.map((group) => ({
          group_id: group.id,
          group_name: group.name,
          selections: selectedModifiers[group.id] || [],
        }))
        .filter((m) => m.selections.length > 0) || []

    onAddToCart({
      item_id: item.id,
      name: item.name,
      quantity,
      base_price: item.price,
      modifiers,
      subtotal: total,
      special_instructions:
        specialInstructions || undefined,
    })

    onClose()
  }

  /* ================= RENDER ================= */

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">

        {/* Hero Image */}
        {item.image_url && (
          <div className="relative h-64 bg-gray-100">
            <img
              src={item.image_url}
              alt={item.name}
              className="w-full h-full object-cover"
            />

            {item.featured && (
              <div className="absolute top-4 right-4 bg-amber-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
                ⭐ Featured
              </div>
            )}

            {isLowStock && (
              <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg animate-pulse">
                Only {item.inventory_count} left!
              </div>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                {item.name}
              </h2>
              <p className="text-gray-600 mb-3">
                {item.description}
              </p>
            </div>

            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl ml-4"
            >
              ×
            </button>
          </div>

          {/* Modifiers */}
          {modifierGroups.length > 0 && (
            <div className="space-y-6 mb-6">
              {modifierGroups.map((group) => (
                <div key={group.id} className="border-t pt-4">
                  <h3 className="font-semibold text-lg mb-2">
                    {group.name}
                    {group.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </h3>

                  {errors[group.id] && (
                    <p className="text-red-500 text-sm mb-2">
                      {errors[group.id]}
                    </p>
                  )}

                  <div className="space-y-2">
                    {group.modifiers.map((modifier) => {
                      const isSelected = (
                        selectedModifiers[group.id] || []
                      ).some((m) => m.id === modifier.id)

                      return (
                        <button
                          key={modifier.id}
                          onClick={() =>
                            handleModifierSelection(group, {
                              id: modifier.id,
                              name: modifier.name,
                              price_adjustment:
                                modifier.price_adjustment,
                            })
                          }
                          className={`w-full flex justify-between items-center p-3 rounded-lg border-2 transition ${
                            isSelected
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <span>{modifier.name}</span>

                          {modifier.price_adjustment > 0 && (
                            <span className="text-amber-600 font-semibold">
                              +$
                              {modifier.price_adjustment.toFixed(2)}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Special Instructions */}
          <textarea
            value={specialInstructions}
            onChange={(e) =>
              setSpecialInstructions(e.target.value)
            }
            placeholder="Special requests..."
            className="w-full mb-6 px-4 py-3 border rounded-lg"
          />

          {/* Quantity & Total */}
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setQuantity((q) => Math.max(1, q - 1))
                }
                className="w-8 h-8 border rounded-full"
              >
                −
              </button>

              <span className="w-8 text-center">
                {quantity}
              </span>

              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 border rounded-full"
              >
                +
              </button>
            </div>

            <div className="text-xl font-bold text-amber-600">
              ${total.toFixed(2)}
            </div>
          </div>

          <button
            onClick={handleAddToCart}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-4 rounded-lg"
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}