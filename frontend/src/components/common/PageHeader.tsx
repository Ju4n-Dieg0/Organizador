import type { ReactNode } from 'react';
import { Flex } from 'antd';
import { colors } from '../../theme';

interface PageHeaderProps {
  /** Eyebrow label uppercase pequeño sobre el título. */
  eyebrow: string;
  title: string;
  /** Acciones a la derecha (botones, filtros). */
  extra?: ReactNode;
  /** Contenido extra junto al título (tags, etc.). */
  titleExtra?: ReactNode;
}

/**
 * Encabezado de página: eyebrow uppercase + heading grande (700, -0.02em).
 * Reemplaza al header corporativo: cada página es dueña de su título.
 */
export function PageHeader({ eyebrow, title, extra, titleExtra }: PageHeaderProps) {
  return (
    <Flex
      justify="space-between"
      align="flex-end"
      wrap
      gap={12}
      style={{ marginBottom: 24 }}
    >
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.18em',
            color: colors.accent,
            marginBottom: 6,
          }}
        >
          {eyebrow}
        </div>
        <Flex align="center" gap={12} wrap>
          <h1
            style={{
              margin: 0,
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1.15,
              color: colors.text,
            }}
          >
            {title}
          </h1>
          {titleExtra}
        </Flex>
      </div>
      {extra && <div>{extra}</div>}
    </Flex>
  );
}
