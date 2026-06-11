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
