export class DriveLinkResponseDto {
  id: number;
  url: string;
  label: string | null;
}

export class ClientResponseDto {
  id: number;
  name: string;
  active: boolean;
  plan: { id: number; name: string } | null;
  driveLinks: DriveLinkResponseDto[];
  openTaskCount: number;
  createdAt: string;
  updatedAt: string;
}
