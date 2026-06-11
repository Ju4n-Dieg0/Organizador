import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { clientsApi } from '../api/clients.api';
import { getApiErrorMessage } from '../api/http';
import type {
  ClientsQuery,
  CreateClientRequest,
  UpdateClientRequest,
} from '../types/client.types';

const CLIENTS_KEY = ['clients'] as const;

export function useClients(query: ClientsQuery = {}) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, query],
    queryFn: () => clientsApi.list(query),
  });
}

export function useClient(id: number | undefined) {
  return useQuery({
    queryKey: [...CLIENTS_KEY, 'detail', id],
    queryFn: () => clientsApi.getById(id as number),
    enabled: id !== undefined && !Number.isNaN(id),
  });
}

function useClientMutationHandlers(successMessage: string, errorFallback: string) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  return {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CLIENTS_KEY });
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      message.success(successMessage);
    },
    onError: (error: unknown) => {
      message.error(getApiErrorMessage(error, errorFallback));
    },
  };
}

export function useCreateClient() {
  const handlers = useClientMutationHandlers(
    'Cliente creado correctamente',
    'No se pudo crear el cliente',
  );
  return useMutation({
    mutationFn: (data: CreateClientRequest) => clientsApi.create(data),
    ...handlers,
  });
}

export function useUpdateClient() {
  const handlers = useClientMutationHandlers(
    'Cliente actualizado correctamente',
    'No se pudo actualizar el cliente',
  );
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateClientRequest }) =>
      clientsApi.update(id, data),
    ...handlers,
  });
}

export function useDeactivateClient() {
  const handlers = useClientMutationHandlers(
    'Cliente desactivado',
    'No se pudo desactivar el cliente',
  );
  return useMutation({
    mutationFn: (id: number) => clientsApi.deactivate(id),
    ...handlers,
  });
}

export function useActivateClient() {
  const handlers = useClientMutationHandlers(
    'Cliente reactivado',
    'No se pudo reactivar el cliente',
  );
  return useMutation({
    mutationFn: (id: number) => clientsApi.activate(id),
    ...handlers,
  });
}
