export const ROUTES = {
  login: '/login',
  dashboard: '/',
  clients: '/clientes',
  clientDetail: '/clientes/:id',
  plans: '/planes',
  team: '/equipo',
  tasks: '/pendientes',
  requests: '/solicitudes',
} as const;

export const clientDetailPath = (id: number): string => `/clientes/${id}`;
