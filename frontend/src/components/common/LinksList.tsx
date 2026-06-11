import { Space, Tooltip, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';

interface LinkItem {
  id: number;
  url: string;
  label: string | null;
}

interface LinksListProps {
  links: LinkItem[];
  /** "compact" muestra solo iconos con tooltip; "full" muestra label + url. */
  mode?: 'compact' | 'full';
}

/** Lista de enlaces externos (Drive, recursos de tareas, etc.). */
export function LinksList({ links, mode = 'full' }: LinksListProps) {
  if (links.length === 0) {
    return <Typography.Text type="secondary">—</Typography.Text>;
  }

  if (mode === 'compact') {
    return (
      <Space size={4} wrap>
        {links.map((link) => (
          <Tooltip key={link.id} title={link.label ?? link.url}>
            <Typography.Link
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir enlace: ${link.label ?? link.url}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
              }}
            >
              <LinkOutlined />
            </Typography.Link>
          </Tooltip>
        ))}
      </Space>
    );
  }

  return (
    <Space direction="vertical" size={4}>
      {links.map((link) => (
        <Typography.Link
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <LinkOutlined style={{ marginInlineEnd: 6 }} />
          {link.label ?? link.url}
        </Typography.Link>
      ))}
    </Space>
  );
}
