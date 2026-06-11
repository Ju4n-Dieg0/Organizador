import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { App } from 'antd';
import { authApi } from '../api/auth.api';
import { getApiErrorMessage } from '../api/http';
import { STORAGE_KEYS } from '../constants/api';
import { ROUTES } from '../constants/routes';
import type { AuthUser, LoginRequest } from '../types/auth.types';

export function getStoredToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.token);
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(getStoredUser);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp();

  const loginMutation = useMutation({
    mutationFn: (data: LoginRequest) => authApi.login(data),
    onSuccess: (data) => {
      localStorage.setItem(STORAGE_KEYS.token, data.accessToken);
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(data.user));
      setUser(data.user);
      message.success(`Bienvenido, ${data.user.name}`);
      navigate(ROUTES.dashboard, { replace: true });
    },
    onError: (error) => {
      message.error(
        getApiErrorMessage(error, 'No se pudo iniciar sesión. Verifica tus credenciales.'),
      );
    },
  });

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
    setUser(null);
    queryClient.clear();
    navigate(ROUTES.login, { replace: true });
  }, [navigate, queryClient]);

  return {
    user,
    isAuthenticated: Boolean(getStoredToken()),
    login: loginMutation.mutate,
    isLoggingIn: loginMutation.isPending,
    logout,
  };
}
