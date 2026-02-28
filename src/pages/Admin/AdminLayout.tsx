// src/pages/Admin/AdminLayout.tsx

import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase/supabaseClient';

function navClass(isActive: boolean) {
  return isActive
    ? 'rounded-lg bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-600'
    : 'rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-orange-600 transition';
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    async function checkAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user?.id) {
        navigate('/login', { replace: true });
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (error || data?.role !== 'admin') {
        navigate('/', { replace: true });
        return;
      }

      setAuthorized(true);
      setLoading(false);
    }

    checkAdmin();
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-gray-300 border-t-gray-700 rounded-full" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        </div>

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

          {/* 🔥 NEW MARKETING LINKS */}

          <NavLink to="/admin/marketing/campaigns" className={({ isActive }) => navClass(isActive)}>
            Campaigns
          </NavLink>

          <NavLink to="/admin/marketing/promos" className={({ isActive }) => navClass(isActive)}>
            Promo Codes
          </NavLink>

          <NavLink to="/admin/marketing/abandoned" className={({ isActive }) => navClass(isActive)}>
            Abandoned Carts
          </NavLink>

          <NavLink to="/admin/marketing/optimizer" className={({ isActive }) => navClass(isActive)}>
            AI Optimizer
          </NavLink>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
