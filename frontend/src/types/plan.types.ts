export interface PlanResponse {
  id: number;
  name: string;
  description: string | null;
  clientCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePlanRequest {
  name: string;
  description?: string;
}

export interface UpdatePlanRequest {
  name?: string;
  description?: string;
}
