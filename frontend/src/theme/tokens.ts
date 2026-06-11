/**
 * Tokens del design system v2 "Midnight Glass"
 * (design-system/organizador/MASTER.md).
 * ÚNICA fuente de colores del frontend: los componentes NUNCA usan hex crudos,
 * consumen estos tokens o `theme.useToken()` de AntD.
 */
export const colors = {
  /** Fondo profundo (base del gradiente) */
  bgDeep: '#020203',
  /** Fondo base (top del gradiente) */
  bgBase: '#0a0a0f',
  /** Superficie elevada sólida: modals, drawers, dropdowns */
  bgElevated: '#101016',
  /** Card translúcida (glass) */
  surfaceGlass: 'rgba(255,255,255,0.04)',
  surfaceGlassHover: 'rgba(255,255,255,0.07)',
  /** Shell exterior del doble bisel */
  surfaceShell: 'rgba(255,255,255,0.03)',
  /** Fondo de inputs */
  surfaceInput: 'rgba(255,255,255,0.05)',
  borderGlass: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.14)',
  text: '#EDEDEF',
  textMuted: '#8A8F98',
  /** Acento único (índigo Linear, AA sobre dark) */
  accent: '#6E79F4',
  accentGlow: 'rgba(110,121,244,0.25)',
  /**
   * Texto sobre `accent` (botones primarios, item activo del dock).
   * Oscuro (= bgBase) porque blanco sobre #6E79F4 da 3.7:1 (< 4.5:1 AA);
   * este da ≈5.2:1.
   */
  onAccent: '#0a0a0f',
  success: '#4ADE80',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',
  /** Overlay de modals/drawers */
  overlay: 'rgba(2,2,3,0.6)',
  /** Blobs ambientales del fondo */
  blobIndigo: 'rgba(110,121,244,0.14)',
  blobViolet: 'rgba(76,29,149,0.12)',
} as const;

/** Convierte un hex `#RRGGBB` a `rgba(r,g,b,alpha)` (tags al 12%/25%). */
export function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Color semántico por estado de pendiente (MASTER §Componentes clave):
 * PENDIENTE=textMuted, ASIGNADO=info, TERMINADO=success, EXTENDIDO=warning.
 */
export const taskStatusColor = {
  PENDIENTE: colors.textMuted,
  ASIGNADO: colors.info,
  TERMINADO: colors.success,
  EXTENDIDO: colors.warning,
} as const;

export const fonts = {
  body: "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
  heading: "'Plus Jakarta Sans', 'Segoe UI', system-ui, sans-serif",
} as const;

export const radii = {
  base: 12,
  card: 16,
  /** Shell exterior del doble bisel */
  shell: 20,
  /** Núcleo interior del doble bisel */
  inner: 14,
  pill: 9999,
} as const;

export const shadows = {
  /** Refracción de borde en cards glass (sin sombras negras duras) */
  glassInset: 'inset 0 1px 1px rgba(255,255,255,0.06)',
  /** Glow del acento (botón primario hover, item activo del dock, drag) */
  accentGlow: `0 0 24px ${colors.accentGlow}`,
  dockGlow: `0 0 16px ${colors.accentGlow}`,
} as const;

/** Motion: easing expo-out global y duraciones (MASTER §Motion). */
export const motionTokens = {
  /** cubic-bezier(0.16, 1, 0.3, 1) como tuple para framer-motion */
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  easeCss: 'cubic-bezier(0.16, 1, 0.3, 1)',
  enter: 0.26,
  exit: 0.16,
  /** Stagger de listas/cards: 30–50ms por item */
  stagger: 0.04,
} as const;

/** Fondo del app shell: radiales índigo + lineal bgBase→bgDeep. */
export const appBackground = [
  `radial-gradient(600px 400px at 15% 10%, ${colors.blobIndigo}, transparent 60%)`,
  `radial-gradient(700px 500px at 85% 85%, ${colors.blobViolet}, transparent 60%)`,
  `linear-gradient(180deg, ${colors.bgBase} 0%, ${colors.bgDeep} 100%)`,
].join(', ');
