export interface DriveLinkResponse {
  id: number;
  url: string;
  label: string | null;
}

export interface ClientResponse {
  id: number;
  name: string;
  active: boolean;
  plan: { id: number; name: string } | null;
  driveLinks: DriveLinkResponse[];
  /** Tareas con status != TERMINADO */
  openTaskCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DriveLinkInput {
  url: string;
  label?: string;
}

export interface CreateClientRequest {
  name: string;
  planId?: number;
  driveLinks?: DriveLinkInput[];
}

export interface UpdateClientRequest {
  name?: string;
  planId?: number | null;
  /** Reemplaza la lista completa */
  driveLinks?: DriveLinkInput[];
}

export type ClientStatusFilter = 'active' | 'inactive' | 'all';

export interface ClientsQuery {
  status?: ClientStatusFilter;
  search?: string;
}
