import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { teamApi } from '../api/team.api';
import { getApiErrorMessage } from '../api/http';
import type {
  CreateTeamMemberRequest,
  TeamStatusFilter,
  UpdateTeamMemberRequest,
} from '../types/team.types';

const TEAM_KEY = ['team-members'] as const;

export function useTeamMembers(status?: TeamStatusFilter) {
  return useQuery({
    queryKey: [...TEAM_KEY, status ?? 'all'],
    queryFn: () => teamApi.list(status),
  });
}

function useTeamMutationHandlers(successMessage: string, errorFallback: string) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  return {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_KEY });
      message.success(successMessage);
    },
    onError: (error: unknown) => {
      message.error(getApiErrorMessage(error, errorFallback));
    },
  };
}

export function useCreateTeamMember() {
  const handlers = useTeamMutationHandlers(
    'Persona creada correctamente',
    'No se pudo crear la persona',
  );
  return useMutation({
    mutationFn: (data: CreateTeamMemberRequest) => teamApi.create(data),
    ...handlers,
  });
}

export function useUpdateTeamMember() {
  const handlers = useTeamMutationHandlers(
    'Persona actualizada correctamente',
    'No se pudo actualizar la persona',
  );
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTeamMemberRequest }) =>
      teamApi.update(id, data),
    ...handlers,
  });
}

export function useDeactivateTeamMember() {
  const handlers = useTeamMutationHandlers(
    'Persona desactivada',
    'No se pudo desactivar la persona',
  );
  return useMutation({
    mutationFn: (id: number) => teamApi.deactivate(id),
    ...handlers,
  });
}

export function useActivateTeamMember() {
  const handlers = useTeamMutationHandlers(
    'Persona reactivada',
    'No se pudo reactivar la persona',
  );
  return useMutation({
    mutationFn: (id: number) => teamApi.activate(id),
    ...handlers,
  });
}

/**
 * Genera (o regenera) el enlace de vinculación de Telegram de un miembro.
 * No muestra toast de éxito: el enlace se presenta en un modal desde la página.
 * El error (p. ej. 503 si el bot no está configurado) muestra el mensaje del backend.
 */
export function useGenerateTelegramLink() {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: (id: number) => teamApi.generateTelegramLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TEAM_KEY });
    },
    onError: (error: unknown) => {
      message.error(
        getApiErrorMessage(error, 'No se pudo generar el enlace de Telegram'),
      );
    },
  });
}

export function useUnlinkTelegram() {
  const handlers = useTeamMutationHandlers(
    'Telegram desvinculado',
    'No se pudo desvincular Telegram',
  );
  return useMutation({
    mutationFn: (id: number) => teamApi.unlinkTelegram(id),
    ...handlers,
  });
}
