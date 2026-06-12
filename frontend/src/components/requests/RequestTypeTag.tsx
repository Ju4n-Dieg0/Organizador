import { REQUEST_TYPE_LABELS } from '../../constants/requestStatus';
import { requestTypeColor } from '../../theme';
import type { TeamRequestType } from '../../types/request.types';
import { TagPill } from '../common/TagPill';

interface RequestTypeTagProps {
  type: TeamRequestType;
  size?: 'sm' | 'md';
}

/** Tag semántico del tipo de solicitud (color por tipo desde el tema). */
export function RequestTypeTag({ type, size = 'md' }: RequestTypeTagProps) {
  return (
    <TagPill color={requestTypeColor[type]} size={size}>
      {REQUEST_TYPE_LABELS[type]}
    </TagPill>
  );
}
