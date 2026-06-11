import type { ReactNode } from 'react';
import { radii, withAlpha } from '../../theme';

interface TagPillProps {
  /** Color semántico base (hex de theme/tokens). */
  color: string;
  children: ReactNode;
  size?: 'sm' | 'md';
}

/**
 * Tag de estado del design system: texto del color semántico,
 * fondo al 12% y borde al 25% del color (MASTER §Componentes clave).
 */
export function TagPill({ color, children, size = 'md' }: TagPillProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: size === 'sm' ? '1px 8px' : '2px 10px',
        fontSize: size === 'sm' ? 11 : 12,
        fontWeight: 500,
        lineHeight: '18px',
        whiteSpace: 'nowrap',
        borderRadius: radii.pill,
        color,
        background: withAlpha(color, 0.12),
        border: `1px solid ${withAlpha(color, 0.25)}`,
      }}
    >
      {children}
    </span>
  );
}
