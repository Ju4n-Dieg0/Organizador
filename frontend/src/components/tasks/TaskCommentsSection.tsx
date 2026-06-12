import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Alert, Avatar, Button, Flex, Input, Skeleton, Tooltip, Typography } from 'antd';
import { CrownOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { useAddTaskComment, useTaskComments } from '../../hooks/useTasks';
import { EmptyState } from '../common/EmptyState';
import { formatDateTime, formatRelative } from '../../services/date.service';
import { colors, commentAuthorColor, motionTokens, withAlpha } from '../../theme';
import type { TaskCommentResponse } from '../../types/task.types';

interface TaskCommentsSectionProps {
  taskId: number;
}

const COMMENT_MAX_LENGTH = 2000;
/** El contador de caracteres solo aparece cerca del límite (evita ruido). */
const SHOW_COUNT_THRESHOLD = COMMENT_MAX_LENGTH - 200;

/** Un comentario del hilo: avatar semántico por autor + nombre + tiempo + texto. */
function CommentItem({ comment }: { comment: TaskCommentResponse }) {
  const color = commentAuthorColor[comment.authorType];
  return (
    <Flex gap={12} align="flex-start">
      <Avatar
        size={28}
        icon={comment.authorType === 'DUENO' ? <CrownOutlined /> : <UserOutlined />}
        style={{
          backgroundColor: withAlpha(color, 0.12),
          color,
          border: `1px solid ${withAlpha(color, 0.25)}`,
          flexShrink: 0,
        }}
      />
      <Flex vertical gap={2} style={{ minWidth: 0, flex: 1 }}>
        <Flex gap={8} align="baseline" wrap>
          <Typography.Text strong>{comment.authorName}</Typography.Text>
          <Tooltip title={formatDateTime(comment.createdAt)}>
            {/* tabIndex: el tooltip con la fecha completa también debe
                poder mostrarse navegando con teclado. aria-label: lectores
                de pantalla reciben el tiempo relativo + la fecha completa. */}
            <Typography.Text
              tabIndex={0}
              aria-label={`${formatRelative(comment.createdAt)}, ${formatDateTime(comment.createdAt)}`}
              style={{ color: colors.textMuted, fontSize: 12 }}
            >
              {formatRelative(comment.createdAt)}
            </Typography.Text>
          </Tooltip>
        </Flex>
        {/* pre-wrap: respeta los saltos de línea escritos en el comentario. */}
        <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
          {comment.text}
        </Typography.Paragraph>
      </Flex>
    </Flex>
  );
}

/**
 * Hilo de comentarios del pendiente (web = administrador; los miembros
 * comentan desde Telegram) + composer con envío por Enter.
 */
export function TaskCommentsSection({ taskId }: TaskCommentsSectionProps) {
  const reducedMotion = useReducedMotion();
  const { data: comments, isLoading, isError, refetch } = useTaskComments(taskId);
  const addComment = useAddTaskComment(taskId);
  const [text, setText] = useState('');

  // El stagger solo aplica a la carga inicial del hilo; un comentario nuevo
  // aparece de inmediato (sin acumular delay en hilos largos).
  const didInitialAnimationRef = useRef(false);
  useEffect(() => {
    if (comments) {
      didInitialAnimationRef.current = true;
    }
  }, [comments]);

  const trimmed = text.trim();

  const send = () => {
    if (!trimmed || addComment.isPending) return;
    addComment.mutate({ text: trimmed }, { onSuccess: () => setText('') });
  };

  const handlePressEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Composición IME activa (p. ej. acentos/CJK): Enter confirma el texto,
    // no envía el comentario.
    if (event.nativeEvent.isComposing) return;
    // Enter envía; Shift+Enter inserta salto de línea.
    if (event.shiftKey) return;
    event.preventDefault();
    send();
  };

  return (
    <div>
      {/* h2 (sin salto h1→h5); tamaño visual de nivel 5 vía fontSize,
          igual que "Historial". */}
      <Typography.Title level={2} style={{ fontSize: 16 }}>
        Comentarios
      </Typography.Title>

      {isLoading ? (
        <Skeleton active avatar paragraph={{ rows: 2 }} />
      ) : isError ? (
        <Alert
          type="error"
          showIcon
          message="No se pudieron cargar los comentarios. Intenta de nuevo."
          action={
            <Button size="small" onClick={() => refetch()}>
              Reintentar
            </Button>
          }
        />
      ) : (comments ?? []).length === 0 ? (
        <EmptyState description="Aún no hay comentarios. Escribe el primero." />
      ) : (
        <ul
          role="list"
          aria-label="Comentarios"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {(comments ?? []).map((comment, index) => (
            <motion.li
              key={comment.id}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: motionTokens.enter,
                ease: motionTokens.ease,
                delay:
                  reducedMotion || didInitialAnimationRef.current
                    ? 0
                    : index * motionTokens.stagger,
              }}
            >
              <CommentItem comment={comment} />
            </motion.li>
          ))}
        </ul>
      )}

      <Flex vertical gap={4} style={{ marginTop: 16 }}>
        <Flex gap={8} align="flex-end">
          <Input.TextArea
            value={text}
            onChange={(event) => setText(event.target.value)}
            onPressEnter={handlePressEnter}
            placeholder="Escribe un comentario…"
            aria-label="Escribir comentario"
            autoSize={{ minRows: 1, maxRows: 4 }}
            maxLength={COMMENT_MAX_LENGTH}
            showCount={text.length >= SHOW_COUNT_THRESHOLD}
            // readOnly (no disabled): el foco permanece en el textarea al
            // enviar con Enter; el guard de send() ya evita doble envío.
            readOnly={addComment.isPending}
          />
          <Button
            type="primary"
            icon={<SendOutlined />}
            aria-label="Enviar comentario"
            onClick={send}
            loading={addComment.isPending}
            disabled={!trimmed}
          />
        </Flex>
        <Typography.Text style={{ fontSize: 12, color: colors.textMuted }}>
          Enter envía · Shift+Enter salto de línea
        </Typography.Text>
      </Flex>
    </div>
  );
}
