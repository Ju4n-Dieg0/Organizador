import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredToken } from '../../hooks/useAuth';
import { ROUTES } from '../../constants/routes';

interface ProtectedRouteProps {
  children: ReactNode;
}

/** Redirige a /login si no hay token de sesión. */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (!getStoredToken()) {
    return <Navigate to={ROUTES.login} replace />;
  }
  return <>{children}</>;
}
