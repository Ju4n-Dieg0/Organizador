import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { motionTokens } from '../../theme';

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * Entrada de página: fade + translateY(12px) → 0 con easing expo-out
 * (MASTER §Motion). Respeta prefers-reduced-motion.
 */
export function PageTransition({ children }: PageTransitionProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: motionTokens.enter, ease: motionTokens.ease }}
    >
      {children}
    </motion.div>
  );
}
