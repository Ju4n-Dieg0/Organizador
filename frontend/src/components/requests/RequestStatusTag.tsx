import { REQUEST_STATUS_LABELS } from '../../constants/requestStatus';
import { requestStatusColor } from '../../theme';
import type { TeamRequestStatus } from '../../types/request.types';
import { TagPill } from '../common/TagPill';

interface RequestStatusTagProps {
  status: TeamRequestStatus;
  size?: 'sm' | 'md';
}

/** Tag semántico del estado de una solicitud. */
export function RequestStatusTag({ status, size = 'md' }: RequestStatusTagProps) {
  return (
    <TagPill color={requestStatusColor[status]} size={size}>
      {REQUEST_STATUS_LABELS[status]}
    </TagPill>
  );
}
