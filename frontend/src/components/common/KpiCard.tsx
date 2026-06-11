import type { ReactNode } from 'react';
import { Skeleton } from 'antd';
import { colors, radii, shadows, withAlpha } from '../../theme';

interface KpiCardProps {
  label: string;
  value: number;
  /** Color del número (default texto primario). */
  valueColor?: string;
  /** Icono opcional en chip circular con glow de acento. */
  icon?: ReactNode;
  /** Color del chip del icono (default acento). */
  iconColor?: string;
  loading?: boolean;
}

/**
 * KPI card con doble bisel (MASTER §Componentes clave):
 * shell exterior radius 20 + padding 6, núcleo interior radius 14 con su borde.
 * Número 28–32px weight 700 tabular-nums; label 12px uppercase muted.
 */
export function KpiCard({
  label,
  value,
  valueColor = colors.text,
  icon,
  iconColor = colors.accent,
  loading = false,
}: KpiCardProps) {
  return (
    <div
      style={{
        background: colors.surfaceShell,
        border: `1px solid ${colors.borderGlass}`,
        borderRadius: radii.shell,
        padding: 6,
        height: '100%',
      }}
    >
      <div
        style={{
          background: colors.surfaceGlass,
          border: `1px solid ${colors.borderGlass}`,
          borderRadius: radii.inner,
          boxShadow: shadows.glassInset,
          padding: '14px 16px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {icon && (
          <span
            aria-hidden
            style={{
              width: 38,
              height: 38,
              flexShrink: 0,
              borderRadius: radii.pill,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 17,
              color: iconColor,
              // Fondo y glow derivados de iconColor (default accent).
              background: withAlpha(iconColor, 0.12),
              boxShadow: `inset 0 0 12px ${withAlpha(iconColor, 0.25)}`,
            }}
          >
            {icon}
          </span>
        )}
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 500,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: colors.textMuted,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </div>
          {loading ? (
            <Skeleton.Button active size="small" style={{ marginTop: 6, height: 24 }} />
          ) : (
            <div
              className="tnum"
              style={{
                fontSize: 30,
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: '-0.02em',
                color: valueColor,
              }}
            >
              {value}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
