import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { tasksApi } from '../api/tasks.api';
import { getApiErrorMessage } from '../api/http';
import type {
  AssignTaskRequest,
  ChangeTaskStatusRequest,
  CreateTaskRequest,
  ExtendTaskRequest,
  ReassignTaskRequest,
  TasksQuery,
  UpdateTaskRequest,
} from '../types/task.types';

const TASKS_KEY = ['tasks'] as const;

export function useTasks(query: TasksQuery = {}) {
  return useQuery({
    queryKey: [...TASKS_KEY, query],
    queryFn: () => tasksApi.list(query),
  });
}

export function useTask(id: number | undefined) {
  return useQuery({
    queryKey: [...TASKS_KEY, 'detail', id],
    queryFn: () => tasksApi.getById(id as number),
    enabled: id !== undefined,
  });
}

function useTaskMutationHandlers(successMessage: string, errorFallback: string) {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  return {
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      message.success(successMessage);
    },
    onError: (error: unknown) => {
      message.error(getApiErrorMessage(error, errorFallback));
    },
  };
}

export function useCreateTask() {
  const handlers = useTaskMutationHandlers(
    'Pendiente creado correctamente',
    'No se pudo crear el pendiente',
  );
  return useMutation({
    mutationFn: (data: CreateTaskRequest) => tasksApi.create(data),
    ...handlers,
  });
}

export function useUpdateTask() {
  const handlers = useTaskMutationHandlers(
    'Pendiente actualizado correctamente',
    'No se pudo actualizar el pendiente',
  );
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateTaskRequest }) =>
      tasksApi.update(id, data),
    ...handlers,
  });
}

export function useAssignTask() {
  const handlers = useTaskMutationHandlers(
    'Pendiente asignado correctamente',
    'No se pudo asignar el pendiente',
  );
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: AssignTaskRequest }) =>
      tasksApi.assign(id, data),
    ...handlers,
  });
}

export function useReassignTask() {
  const handlers = useTaskMutationHandlers(
    'Pendiente reasignado correctamente',
    'No se pudo reasignar el pendiente',
  );
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReassignTaskRequest }) =>
      tasksApi.reassign(id, data),
    ...handlers,
  });
}

export function useExtendTask() {
  const handlers = useTaskMutationHandlers(
    'Fecha de entrega extendida',
    'No se pudo extender la fecha de entrega',
  );
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ExtendTaskRequest }) =>
      tasksApi.extend(id, data),
    ...handlers,
  });
}

export function useCompleteTask() {
  const handlers = useTaskMutationHandlers(
    'Pendiente terminado',
    'No se pudo terminar el pendiente',
  );
  return useMutation({
    mutationFn: (id: number) => tasksApi.complete(id),
    ...handlers,
  });
}

export function useChangeTaskStatus() {
  const handlers = useTaskMutationHandlers(
    'Estado actualizado',
    'No se pudo cambiar el estado',
  );
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ChangeTaskStatusRequest }) =>
      tasksApi.changeStatus(id, data),
    ...handlers,
  });
}
