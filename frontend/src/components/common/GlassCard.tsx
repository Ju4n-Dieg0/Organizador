import type { CSSProperties, ReactNode } from 'react';
import { colors, radii, shadows } from '../../theme';

interface GlassCardProps {
  children: ReactNode;
  /** Padding interno (default 20). */
  padding?: number | string;
  style?: CSSProperties;
  className?: string;
}

/**
 * Card glass del design system: superficie translúcida, borde hairline,
 * refracción de borde con inset highlight. SIN backdrop-blur (puede scrollear).
 */
export function GlassCard({ children, padding = 20, style, className }: GlassCardProps) {
  return (
    <section
      className={className}
      style={{
        background: colors.surfaceGlass,
        border: `1px solid ${colors.borderGlass}`,
        borderRadius: radii.card,
        boxShadow: shadows.glassInset,
        padding,
        ...style,
      }}
    >
      {children}
    </section>
  );
}
