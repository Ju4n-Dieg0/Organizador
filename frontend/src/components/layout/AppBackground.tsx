import { motion, useReducedMotion } from 'framer-motion';
import { appBackground, colors } from '../../theme';

const BLOB_BASE = {
  position: 'absolute' as const,
  borderRadius: '50%',
  filter: 'blur(80px)',
  willChange: 'transform',
};

/**
 * Fondo fijo del sistema (MASTER §Fondo de sistema): gradiente radial índigo
 * sobre bgBase→bgDeep + 2 blobs ambientales con oscilación lenta (solo
 * transform). pointer-events: none; desactivado con prefers-reduced-motion.
 */
export function AppBackground() {
  const reducedMotion = useReducedMotion();

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: appBackground,
      }}
    >
      {!reducedMotion && (
        <>
          <motion.div
            style={{
              ...BLOB_BASE,
              width: 480,
              height: 480,
              top: '-12%',
              left: '8%',
              background: colors.blobIndigo,
            }}
            animate={{ x: [0, 48, -24, 0], y: [0, 36, 64, 0] }}
            transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            style={{
              ...BLOB_BASE,
              width: 560,
              height: 560,
              bottom: '-18%',
              right: '4%',
              background: colors.blobViolet,
            }}
            animate={{ x: [0, -56, 28, 0], y: [0, -40, -72, 0] }}
            transition={{ duration: 34, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}
    </div>
  );
}
