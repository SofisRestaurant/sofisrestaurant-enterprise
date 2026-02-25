import { Outlet, NavLink } from 'react-router-dom'

function navClass(isActive: boolean) {
  return isActive
    ? 'rounded-lg bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-600'
    : 'rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-orange-600 transition';
}

export default function AdminLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Admin Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
          <p className="mt-1 text-sm text-gray-500">Manage restaurant operations and settings</p>
        </div>

        {/* Admin Navigation */}
        <div className="mb-8 flex flex-wrap gap-3 border-b border-gray-200 pb-4">
          <NavLink to="/admin" end className={({ isActive }) => navClass(isActive)}>
            Dashboard
          </NavLink>

          <NavLink to="/admin/orders" className={({ isActive }) => navClass(isActive)}>
            Orders
          </NavLink>

          <NavLink to="/admin/menu" className={({ isActive }) => navClass(isActive)}>
            Menu Editor
          </NavLink>

          <NavLink to="/admin/loyalty-scan" className={({ isActive }) => navClass(isActive)}>
            Loyalty Scanner
          </NavLink>
        </div>

        {/* Nested Routes Render Here */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
}