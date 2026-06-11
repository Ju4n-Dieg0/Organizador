import axios, { AxiosError } from 'axios';
import { API_BASE_URL, STORAGE_KEYS } from '../constants/api';
import { ROUTES } from '../constants/routes';

export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(STORAGE_KEYS.token);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(STORAGE_KEYS.token);
      localStorage.removeItem(STORAGE_KEYS.user);
      if (window.location.pathname !== ROUTES.login) {
        window.location.assign(ROUTES.login);
      }
    }
    return Promise.reject(error);
  },
);

interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
}

/** Extrae el mensaje en español del formato de error estándar de Nest. */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data as ApiErrorBody | undefined;
    const message = body?.message;
    if (Array.isArray(message) && message.length > 0) {
      return message.join('. ');
    }
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
  }
  return fallback;
}
