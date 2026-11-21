import { motion, useAnimationControls } from 'motion/react';
import { useEffect } from 'react';
import { SPRING } from '../motion/prefs.js';

interface Props {
  locked: boolean;
  /** Меняется — замок «дёргается» (неверный пароль). */
  shake?: number;
  size?: number;
  className?: string;
}

/** Замок: дужка опускается при шифровании и поднимается при расшифровке. */
export function LockIcon({ locked, shake = 0, size = 56, className }: Props) {
  const controls = useAnimationControls();

  useEffect(() => {
    if (shake > 0) {
      void controls.start({ x: [0, -9, 8, -6, 5, -2, 0], rotate: [0, -6, 5, -3, 2, 0, 0], transition: { duration: 0.5 } });
    }
  }, [shake, controls]);

  return (
    <motion.div className={className ? `lock ${className}` : 'lock'} animate={controls} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 48 48" width={size} height={size} fill="none">
        <motion.path
          d="M15 22v-6a9 9 0 0 1 18 0v6"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
          initial={false}
          animate={locked ? { y: 0, rotate: 0 } : { y: -6, rotate: -14 }}
          style={{ originX: '33px', originY: '22px' }}
          transition={SPRING}
        />
        <motion.rect
          x={9}
          y={21}
          width={30}
          height={22}
          rx={7}
          fill="currentColor"
          initial={false}
          animate={{ scale: locked ? [1, 1.08, 1] : 1 }}
          transition={{ duration: 0.35 }}
          style={{ originX: '24px', originY: '32px' }}
        />
        <motion.circle
          cx={24}
          cy={31}
          r={3}
          initial={false}
          animate={{ fill: locked ? '#ffffff' : '#7ee2a0' }}
        />
        <rect x={22.5} y={32} width={3} height={6} rx={1.5} fill="#ffffff" />
      </svg>
    </motion.div>
  );
}
