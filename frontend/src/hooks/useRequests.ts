import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { App } from 'antd';
import { requestsApi } from '../api/requests.api';
import { getApiErrorMessage, getApiErrorStatus } from '../api/http';
import type {
  RejectRequestRequest,
  RequestStatusFilter,
} from '../types/request.types';

const REQUESTS_KEY = ['requests'] as const;

export function useRequests(status: RequestStatusFilter = 'all') {
  return useQuery({
    queryKey: [...REQUESTS_KEY, status],
    queryFn: () => requestsApi.list(status),
    // Al cambiar de filtro se mantiene la data anterior visible
    // (la tabla no colapsa a vacío mientras carga).
    placeholderData: keepPreviousData,
  });
}

/**
 * Solicitudes PENDIENTES con polling: pueden resolverse desde Telegram
 * mientras la web está abierta, así que se refrescan cada 30s y al
 * recuperar el foco de la ventana.
 */
export function usePendingRequests() {
  return useQuery({
    queryKey: [...REQUESTS_KEY, 'PENDIENTE'],
    queryFn: () => requestsApi.list('PENDIENTE'),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

function useRequestMutationHandlers(
  successMessage: string,
  errorFallback: string,
) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: REQUESTS_KEY });
    // Aprobar ejecuta la operación real sobre pendientes.
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
  };
  return {
    onSuccess: () => {
      invalidate();
      message.success(successMessage);
    },
    onError: (error: unknown) => {
      // 409: ya se resolvió en otro lado (p. ej. Telegram) → avisar y refrescar.
      if (getApiErrorStatus(error) === 409) {
        message.warning(
          getApiErrorMessage(error, 'Esta solicitud ya fue resuelta'),
        );
        invalidate();
        return;
      }
      message.error(getApiErrorMessage(error, errorFallback));
    },
  };
}

export function useApproveRequest() {
  const handlers = useRequestMutationHandlers(
    'Solicitud aprobada',
    'No se pudo aprobar la solicitud',
  );
  return useMutation({
    mutationFn: (id: number) => requestsApi.approve(id),
    ...handlers,
  });
}

export function useRejectRequest() {
  const handlers = useRequestMutationHandlers(
    'Solicitud rechazada',
    'No se pudo rechazar la solicitud',
  );
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RejectRequestRequest }) =>
      requestsApi.reject(id, data),
    ...handlers,
  });
}
