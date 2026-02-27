import { useEffect, useState, useCallback } from 'react';
import { MenuService, MenuServiceError } from '@/services/menu.service';
import type { MenuItem } from '@/types/menu';
import { ModalShell } from '@/components/ui/ModalShell';

interface FormState {
  name: string;
  category: string;
  price: string;
}

export default function AdminMenuEditor() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: '',
    category: '',
    price: '',
  });

  // ─────────────────────────────────────────────────────
  // Fetch Menu
  // ─────────────────────────────────────────────────────
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await MenuService.getMenuItems();
      setItems(data);
    } catch (err) {
      if (err instanceof MenuServiceError) {
        setError(err.message);
      } else {
        setError('Unexpected error loading menu.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ─────────────────────────────────────────────────────
  // Modal Controls
  // ─────────────────────────────────────────────────────
  function openCreate() {
    setEditingItem(null);
    setForm({ name: '', category: '', price: '' });
    setIsModalOpen(true);
  }

  function openEdit(item: MenuItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      category: item.category,
      price: item.price.toString(),
    });
    setIsModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setIsModalOpen(false);
  }

  // ─────────────────────────────────────────────────────
  // Validation
  // ─────────────────────────────────────────────────────
  function isFormValid() {
    if (!form.name.trim()) return false;
    if (!form.category.trim()) return false;
    if (!form.price.trim()) return false;
    if (isNaN(Number(form.price))) return false;
    if (Number(form.price) <= 0) return false;
    return true;
  }

  // ─────────────────────────────────────────────────────
  // Save
  // ─────────────────────────────────────────────────────
  async function handleSave() {
    if (!isFormValid()) return;

    setSaving(true);
    setError(null);

    try {
      const payload = {
        name: form.name.trim(),
        category: form.category.trim(),
        price: Number(form.price),
      };

      let updatedItem: MenuItem;

      if (editingItem) {
        updatedItem = await MenuService.updateMenuItem(editingItem.id, payload);

        // Optimistic update
        setItems((prev) => prev.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      } else {
        updatedItem = await MenuService.createMenuItem(payload);

        // Add to top
        setItems((prev) => [updatedItem, ...prev]);
      }

      setIsModalOpen(false);
    } catch (err) {
      if (err instanceof MenuServiceError) {
        setError(err.message);
      } else {
        setError('Failed to save menu item.');
      }
    } finally {
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────
  // Soft Delete
  // ─────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    const confirmed = window.confirm('Are you sure you want to remove this item?');
    if (!confirmed) return;

    try {
      await MenuService.deleteMenuItem(id);

      // Optimistic remove
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete item.');
    }
  }

  // ─────────────────────────────────────────────────────
  // Toggle Availability
  // ─────────────────────────────────────────────────────
  async function handleToggleAvailability(item: MenuItem, available: boolean) {
    try {
      await MenuService.toggleAvailability(item.id, available);

      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, available } : i)));
    } catch {
      alert('Failed to update availability.');
    }
  }

  // ─────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────
  return (
    <div className="py-12">
      <div className="container mx-auto px-6">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Menu Editor</h1>

          <button
            onClick={openCreate}
            className="px-6 py-3 rounded-lg bg-black text-white hover:opacity-90 transition"
          >
            Add Item
          </button>
        </div>

        {loading && <p>Loading menu...</p>}
        {error && <p className="text-red-600 mb-4">{error}</p>}

        {!loading && (
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left">Name</th>
                  <th className="px-6 py-3 text-left">Category</th>
                  <th className="px-6 py-3 text-left">Price</th>
                  <th className="px-6 py-3 text-left">Available</th>
                  <th className="px-6 py-3 text-left">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4">{item.name}</td>
                    <td className="px-6 py-4">{item.category}</td>
                    <td className="px-6 py-4">${item.price.toFixed(2)}</td>

                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={item.available}
                        onChange={(e) => handleToggleAvailability(item, e.target.checked)}
                      />
                    </td>

                    <td className="px-6 py-4 space-x-4">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-blue-600 hover:underline"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-gray-500">
                      No menu items found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ───────────────────────────────────────────── */}
      {/* Modal */}
      {/* ───────────────────────────────────────────── */}
      <ModalShell isOpen={isModalOpen} onClose={closeModal}>
        <div className="bg-white p-8 rounded-xl w-500px">
          <h2 className="text-xl font-semibold mb-6">
            {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
          </h2>

          <div className="space-y-4">
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              className="w-full border rounded px-3 py-2"
            />

            <input
              placeholder="Category"
              value={form.category}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  category: e.target.value,
                }))
              }
              className="w-full border rounded px-3 py-2"
            />

            <input
              placeholder="Price"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  price: e.target.value,
                }))
              }
              className="w-full border rounded px-3 py-2"
            />

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={closeModal} disabled={saving} className="px-4 py-2 border rounded">
                Cancel
              </button>

              <button
                onClick={handleSave}
                disabled={!isFormValid() || saving}
                className="px-6 py-2 bg-black text-white rounded disabled:opacity-40"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
