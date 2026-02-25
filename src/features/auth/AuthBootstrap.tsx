// src/features/auth/AuthBootstrap.tsx
import { useEffect } from 'react';
import { useUserContext } from '@/contexts/useUserContext'
import { useNavigate, useLocation } from 'react-router-dom';

interface AuthBootstrapProps {
  children: React.ReactNode;
}

/**
 * AuthBootstrap handles authentication initialization and protected route logic
 */
export default function AuthBootstrap({ children }: AuthBootstrapProps) {
  const { user, loading } = useUserContext();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Protected routes that require authentication
    const protectedRoutes = ['/checkout', '/orders', '/profile', '/admin'];
    const isProtectedRoute = protectedRoutes.some(route => 
      location.pathname.startsWith(route)
    );

    if (!loading && !user && isProtectedRoute) {
      // Redirect to home with a redirect param
      navigate(`/?redirect=${encodeURIComponent(location.pathname)}`);
    }
  }, [user, loading, location.pathname, navigate]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}