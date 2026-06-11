import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardCode,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { App, Button, Dropdown, Skeleton, Typography } from 'antd';
import type { MenuProps } from 'antd';
import {
  CheckOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  MoreOutlined,
  SwapOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { TaskBoardCard } from './TaskBoardCard';
import { useCompleteTask } from '../../hooks/useTasks';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../constants/taskStatus';
import { colors, motionTokens, radii, shadows, taskStatusColor, withAlpha } from '../../theme';
import type { TaskResponse, TaskStatus } from '../../types/task.types';

interface TaskBoardProps {
  tasks: TaskResponse[];
  loading: boolean;
  onView: (task: TaskResponse) => void;
  /** PENDIENTE → ASIGNADO: abre el modal de asignar. */
  onAssign: (task: TaskResponse) => void;
  /** ASIGNADO/EXTENDIDO: abre el modal de reasignar. */
  onReassign: (task: TaskResponse) => void;
  /** ASIGNADO/EXTENDIDO → EXTENDIDO: abre el modal de extender. */
  onExtend: (task: TaskResponse) => void;
}

/** Acciones de dominio disponibles desde cada card (drag o menú accesible). */
interface TaskActions {
  onView: (task: TaskResponse) => void;
  onAssign: (task: TaskResponse) => void;
  onReassign: (task: TaskResponse) => void;
  onExtend: (task: TaskResponse) => void;
  /** Confirmación + complete (mismo flujo que el drop en TERMINADO). */
  onComplete: (task: TaskResponse) => void;
}

/** Transiciones de dominio válidas por drag (docs/SPEC.md). */
function isValidMove(from: TaskStatus, to: TaskStatus): boolean {
  if (from === 'PENDIENTE') return to === 'ASIGNADO';
  if (from === 'ASIGNADO' || from === 'EXTENDIDO')
    return to === 'EXTENDIDO' || to === 'TERMINADO';
  return false;
}

/** Mensaje en español explicando la transición válida desde un estado. */
function invalidMoveMessage(from: TaskStatus, to: TaskStatus): string {
  if (from === 'TERMINADO') {
    return 'Un pendiente terminado no puede cambiar de estado.';
  }
  if (from === 'PENDIENTE') {
    return to === 'TERMINADO'
      ? 'Para terminar un pendiente primero debe pasar por Asignado.'
      : 'Desde Pendiente solo puedes mover a Asignado (asignar personas y fecha).';
  }
  return `Desde ${TASK_STATUS_LABELS[from]} solo puedes mover a Extendido o Terminado.`;
}

interface BoardColumnProps {
  status: TaskStatus;
  tasks: TaskResponse[];
  activeTask: TaskResponse | null;
  actions: TaskActions;
}

function BoardColumn({ status, tasks, activeTask, actions }: BoardColumnProps) {
  const { isOver, setNodeRef } = useDroppable({ id: status });
  const reducedMotion = useReducedMotion();

  const dragging = activeTask !== null;
  const validTarget =
    dragging && activeTask.status !== status && isValidMove(activeTask.status, status);
  const highlight = isOver && dragging;

  // Durante el drag, TODAS las columnas destino válidas se resaltan con borde
  // accent sutil; la columna isOver lleva el resalte fuerte (accent + glow).
  const borderColor = highlight
    ? validTarget
      ? colors.accent
      : colors.borderStrong
    : validTarget
      ? withAlpha(colors.accent, 0.45)
      : colors.borderGlass;

  return (
    <div
      ref={setNodeRef}
      style={{
        background: highlight && validTarget ? colors.surfaceGlassHover : colors.surfaceGlass,
        border: `1px solid ${borderColor}`,
        borderRadius: radii.card,
        boxShadow: highlight && validTarget
          ? `${shadows.glassInset}, ${shadows.dockGlow}`
          : shadows.glassInset,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 360,
        transition: `border-color 0.2s ${motionTokens.easeCss}, box-shadow 0.2s ${motionTokens.easeCss}, background-color 0.2s ${motionTokens.easeCss}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '2px 4px 8px',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: radii.pill,
            background: taskStatusColor[status],
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: colors.textMuted,
          }}
        >
          {TASK_STATUS_LABELS[status]}
        </span>
        <span
          className="tnum"
          aria-label={`${tasks.length} pendientes en ${TASK_STATUS_LABELS[status]}`}
          style={{
            marginLeft: 'auto',
            fontSize: 11,
            fontWeight: 600,
            minWidth: 22,
            textAlign: 'center',
            padding: '1px 7px',
            borderRadius: radii.pill,
            color: colors.text,
            background: withAlpha(taskStatusColor[status], 0.12),
            border: `1px solid ${withAlpha(taskStatusColor[status], 0.25)}`,
          }}
        >
          {tasks.length}
        </span>
      </div>

      {tasks.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${colors.borderGlass}`,
            borderRadius: radii.base,
            padding: '20px 12px',
            textAlign: 'center',
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            Sin pendientes
          </Typography.Text>
        </div>
      ) : (
        tasks.map((task, index) => (
          <motion.div
            key={task.id}
            initial={reducedMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: motionTokens.enter,
              ease: motionTokens.ease,
              delay: reducedMotion ? 0 : Math.min(index, 8) * motionTokens.stagger,
            }}
          >
            <DraggableCard task={task} actions={actions} />
          </motion.div>
        ))
      )}
    </div>
  );
}

interface DraggableCardProps {
  task: TaskResponse;
  actions: TaskActions;
}

/**
 * Menú de acciones accesible por card: alternativa por teclado/AT al drag
 * para disparar las mismas operaciones de dominio (sin duplicar lógica:
 * reutiliza los handlers/modals del TaskBoard).
 */
function CardActionsMenu({ task, actions }: DraggableCardProps) {
  const [open, setOpen] = useState(false);

  const canAssign = task.status === 'PENDIENTE';
  const canMutate = task.status === 'ASIGNADO' || task.status === 'EXTENDIDO';

  const items: MenuProps['items'] = [
    { key: 'view', icon: <EyeOutlined />, label: 'Ver detalle' },
    ...(canAssign
      ? [{ key: 'assign', icon: <UserAddOutlined />, label: 'Asignar' }]
      : []),
    ...(canMutate
      ? [
          { key: 'reassign', icon: <SwapOutlined />, label: 'Reasignar' },
          { key: 'extend', icon: <ClockCircleOutlined />, label: 'Extender fecha' },
          { key: 'complete', icon: <CheckOutlined />, label: 'Terminar' },
        ]
      : []),
  ];

  const handleMenuClick: MenuProps['onClick'] = ({ key, domEvent }) => {
    // No abrir además el detalle (la card entera es role="button").
    domEvent.stopPropagation();
    setOpen(false);
    if (key === 'view') actions.onView(task);
    else if (key === 'assign') actions.onAssign(task);
    else if (key === 'reassign') actions.onReassign(task);
    else if (key === 'extend') actions.onExtend(task);
    else if (key === 'complete') actions.onComplete(task);
  };

  return (
    // stopPropagation: el trigger no debe iniciar drag ni abrir el detalle.
    <span
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Dropdown
        trigger={['click']}
        open={open}
        onOpenChange={setOpen}
        menu={{ items, onClick: handleMenuClick }}
      >
        <Button
          type="text"
          size="small"
          icon={<MoreOutlined />}
          aria-label={`Acciones del pendiente ${task.title}`}
          aria-haspopup="menu"
          aria-expanded={open}
        />
      </Dropdown>
    </span>
  );
}

function DraggableCard({ task, actions }: DraggableCardProps) {
  // TERMINADO no tiene transiciones válidas: el drag se deshabilita y su
  // única interacción es abrir el detalle o el menú de acciones.
  const dragDisabled = task.status === 'TERMINADO';
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled: dragDisabled,
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      // Enter abre el detalle (Space queda para el KeyboardSensor de dnd-kit).
      if (!isDragging) {
        event.preventDefault();
        actions.onView(task);
      }
      return;
    }
    if (event.key === ' ' && dragDisabled) {
      // Sin drag (TERMINADO) la card actúa como botón normal también con Space.
      event.preventDefault();
      actions.onView(task);
      return;
    }
    // Space (levantar/soltar) y demás teclas van al KeyboardSensor.
    listeners?.onKeyDown?.(event);
  };

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...(dragDisabled ? {} : attributes)}
      role="button"
      tabIndex={0}
      aria-label={`Pendiente ${task.title}, estado ${TASK_STATUS_LABELS[task.status]}. Enter para ver el detalle.`}
      onClick={() => actions.onView(task)}
      onKeyDown={handleKeyDown}
      style={{
        opacity: isDragging ? 0.35 : 1,
        // touchAction none SOLO en cards arrastrables (TouchSensor con delay);
        // en TERMINADO se conserva el scroll táctil normal.
        touchAction: dragDisabled ? 'manipulation' : 'none',
      }}
    >
      <TaskBoardCard
        task={task}
        style={dragDisabled ? { cursor: 'default' } : undefined}
        extra={<CardActionsMenu task={task} actions={actions} />}
      />
    </div>
  );
}

/** Instrucciones de drag por teclado anunciadas vía aria-describedby. */
const screenReaderInstructions = {
  draggable:
    'Para levantar un pendiente presiona Espacio. Mientras lo arrastras, usa las flechas para moverlo a otra columna, Espacio para soltarlo y Escape para cancelar.',
};

/**
 * Vista Kanban de pendientes (MASTER §Componentes clave): 4 columnas glass.
 * El drag&drop entre columnas dispara las operaciones de dominio existentes:
 * asignar (con modal), extender (con modal) y terminar (con confirmación).
 * Cada card ofrece además un menú de acciones accesible (teclado/AT) que
 * reutiliza los mismos handlers, y el drag funciona con puntero, táctil
 * (long-press) y teclado (Space + flechas).
 * Los movimientos inválidos se rechazan con animación de regreso + warning.
 */
export function TaskBoard({
  tasks,
  loading,
  onView,
  onAssign,
  onReassign,
  onExtend,
}: TaskBoardProps) {
  const { message, modal } = App.useApp();
  const completeTask = useCompleteTask();
  const reducedMotion = useReducedMotion();
  const [activeTask, setActiveTask] = useState<TaskResponse | null>(null);

  // PointerSensor distance 8 (mouse): distingue click de drag.
  // TouchSensor delay 250 + tolerance 8: long-press para arrastrar sin pelear
  // con el scroll táctil. KeyboardSensor: Space levanta/suelta, flechas mueven
  // (Enter queda libre para abrir el detalle de la card).
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: {
        start: [KeyboardCode.Space],
        cancel: [KeyboardCode.Esc],
        end: [KeyboardCode.Space],
      },
    }),
  );

  const tasksByStatus = useMemo(() => {
    const groups: Record<TaskStatus, TaskResponse[]> = {
      PENDIENTE: [],
      ASIGNADO: [],
      EXTENDIDO: [],
      TERMINADO: [],
    };
    for (const task of tasks) groups[task.status].push(task);
    return groups;
  }, [tasks]);

  /** Confirmación + complete: mismo flujo desde el drop y desde el menú. */
  const confirmComplete = (task: TaskResponse) => {
    modal.confirm({
      title: 'Terminar pendiente',
      content: `¿Marcar "${task.title}" como terminado?`,
      okText: 'Sí, terminar',
      cancelText: 'Cancelar',
      onOk: () => completeTask.mutateAsync(task.id).then(() => undefined),
    });
  };

  const actions: TaskActions = {
    onView,
    onAssign,
    onReassign,
    onExtend,
    onComplete: confirmComplete,
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as TaskResponse | undefined;
    setActiveTask(task ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTask(null);
    const task = event.active.data.current?.task as TaskResponse | undefined;
    const target = event.over?.id as TaskStatus | undefined;
    if (!task || !target || task.status === target) return;

    if (!isValidMove(task.status, target)) {
      // La card regresa sola (no se muta el estado) + explicación.
      message.warning(invalidMoveMessage(task.status, target));
      return;
    }

    if (target === 'ASIGNADO') {
      // Requiere personas + fecha: modal de asignar (si cancela, no pasa nada).
      onAssign(task);
      return;
    }
    if (target === 'EXTENDIDO') {
      // Requiere nueva fecha + razón obligatoria.
      onExtend(task);
      return;
    }
    // target === 'TERMINADO': confirmación + complete.
    confirmComplete(task);
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {TASK_STATUSES.map((status) => (
          <div
            key={status}
            style={{
              background: colors.surfaceGlass,
              border: `1px solid ${colors.borderGlass}`,
              borderRadius: radii.card,
              padding: 16,
            }}
          >
            <Skeleton active paragraph={{ rows: 4 }} />
          </div>
        ))}
      </div>
    );
  }

  // Orden de columnas del flujo: PENDIENTE, ASIGNADO, EXTENDIDO, TERMINADO.
  const columnOrder: TaskStatus[] = ['PENDIENTE', 'ASIGNADO', 'EXTENDIDO', 'TERMINADO'];

  return (
    <DndContext
      sensors={sensors}
      accessibility={{ screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {columnOrder.map((status) => (
          <BoardColumn
            key={status}
            status={status}
            tasks={tasksByStatus[status]}
            activeTask={activeTask}
            actions={actions}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
        {activeTask && <TaskBoardCard task={activeTask} lifted={!reducedMotion} />}
      </DragOverlay>
    </DndContext>
  );
}
