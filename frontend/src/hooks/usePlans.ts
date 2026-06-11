import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { plansApi } from '../api/plans.api';
import { getApiErrorMessage } from '../api/http';
import type { CreatePlanRequest, UpdatePlanRequest } from '../types/plan.types';

const PLANS_KEY = ['plans'] as const;

export function usePlans() {
  return useQuery({
    queryKey: PLANS_KEY,
    queryFn: () => plansApi.list(),
  });
}

export function useCreatePlan() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (data: CreatePlanRequest) => plansApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      message.success('Plan creado correctamente');
    },
    onError: (error) => {
      message.error(getApiErrorMessage(error, 'No se pudo crear el plan'));
    },
  });
}

export function useUpdatePlan() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePlanRequest }) =>
      plansApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      message.success('Plan actualizado correctamente');
    },
    onError: (error) => {
      message.error(getApiErrorMessage(error, 'No se pudo actualizar el plan'));
    },
  });
}

export function useDeletePlan() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (id: number) => plansApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PLANS_KEY });
      message.success('Plan eliminado correctamente');
    },
    onError: (error) => {
      message.error(
        getApiErrorMessage(
          error,
          'No se pudo eliminar el plan. Verifica que no tenga clientes asociados.',
        ),
      );
    },
  });
}
