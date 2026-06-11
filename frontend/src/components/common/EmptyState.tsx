import { Button, Empty } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface EmptyStateProps {
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Empty state con acción opcional. */
export function EmptyState({ description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={description}>
      {actionLabel && onAction && (
        <Button type="primary" icon={<PlusOutlined />} onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Empty>
  );
}
