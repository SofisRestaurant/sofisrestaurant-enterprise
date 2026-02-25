// src/pages/Account/AccountLayout.tsx
import { NavLink, Outlet } from 'react-router-dom'

const linkBase = 'block rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200'
const linkActive = 'bg-gray-900 text-white shadow-md'
const linkInactive = 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 active:scale-[0.98]'

export default function AccountLayout() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <aside className="rounded-2xl border border-gray-200/80 bg-white p-4 shadow-lg">
          <h2 className="mb-3 text-base font-semibold text-gray-900 tracking-tight">
            Account
          </h2>
          <nav className="space-y-1">
            <NavLink
              to="/account"
              end
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              Overview
            </NavLink>
            <NavLink
              to="/account/edit"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              Edit Profile
            </NavLink>
            <NavLink
              to="/account/orders"
              className={({ isActive }) =>
                `${linkBase} ${isActive ? linkActive : linkInactive}`
              }
            >
              Order History
            </NavLink>
          </nav>
        </aside>
        <section className="rounded-2xl border border-gray-200/80 bg-white p-6 shadow-lg">
          <Outlet />
        </section>
      </div>
    </div>
  )
}