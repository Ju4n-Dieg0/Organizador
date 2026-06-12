import { IsIn, IsOptional } from 'class-validator';
import {
  TEAM_REQUEST_STATUSES,
  TeamRequestStatus,
} from './team-request-response.dto';

const QUERY_STATUSES = [...TEAM_REQUEST_STATUSES, 'all'] as const;

export class QueryRequestsDto {
  @IsOptional()
  @IsIn(QUERY_STATUSES, {
    message: `El estado debe ser uno de: ${QUERY_STATUSES.join(', ')}`,
  })
  status?: TeamRequestStatus | 'all' = 'all';
}
