import { Outlet, NavLink } from 'react-router-dom'

export default function AdminLayout() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Admin Navigation */}
      <div className="mb-6 flex gap-4 border-b pb-4">
        <NavLink
          to="/admin"
          end
          className={({ isActive }) =>
            isActive
              ? 'font-semibold text-orange-600'
              : 'text-gray-600 hover:text-orange-600'
          }
        >
          Dashboard
        </NavLink>

        <NavLink
          to="/admin/orders"
          className={({ isActive }) =>
            isActive
              ? 'font-semibold text-orange-600'
              : 'text-gray-600 hover:text-orange-600'
          }
        >
          Orders
        </NavLink>

        <NavLink
          to="/admin/menu"
          className={({ isActive }) =>
            isActive
              ? 'font-semibold text-orange-600'
              : 'text-gray-600 hover:text-orange-600'
          }
        >
          Menu Editor
        </NavLink>
      </div>

      {/* Nested pages render here */}
      <Outlet />
    </div>
  )
}