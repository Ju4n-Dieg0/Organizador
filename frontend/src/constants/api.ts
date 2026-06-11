export const API_BASE_URL = import.meta.env.VITE_API_URL;

export const STORAGE_KEYS = {
  token: 'organizador.token',
  user: 'organizador.user',
  /** Vista preferida de Pendientes: 'table' | 'kanban' */
  tasksView: 'organizador.tasksView',
} as const;

export const API_PATHS = {
  login: '/auth/login',
  me: '/auth/me',
  plans: '/plans',
  clients: '/clients',
  teamMembers: '/team-members',
  tasks: '/tasks',
} as const;
