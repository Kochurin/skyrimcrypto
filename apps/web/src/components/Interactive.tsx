import { motion, useMotionValue, useSpring } from 'motion/react';
import type { ComponentPropsWithRef, PointerEvent, ReactNode } from 'react';
import { motionAllowed } from '../motion/prefs.js';

/** Записывает позицию курсора в CSS-переменные --mx/--my: по ним рисуется подсветка карточки. */
export function trackSpotlight(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${e.clientX - r.left}px`);
  el.style.setProperty('--my', `${e.clientY - r.top}px`);
}

/**
 * «Магнитная» кнопка: слегка тянется за курсором и пружинит обратно,
 * при нажатии сжимается. Только transform — без перерасчёта раскладки.
 */
export function MagneticButton({ children, className, disabled, ref, ...rest }: ComponentPropsWithRef<'button'> & { children: ReactNode }) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });
  const enabled = motionAllowed() && !disabled;

  // Обработчики drag/animation из HTML-атрибутов конфликтуют с одноимёнными у motion
  const { onDrag: _d, onDragStart: _ds, onDragEnd: _de, onAnimationStart: _as, onAnimationEnd: _ae, onAnimationIteration: _ai, ...props } = rest;

  return (
    <motion.button
      {...props}
      ref={ref}
      disabled={disabled}
      className={className}
      style={{ x: sx, y: sy }}
      whileTap={enabled ? { scale: 0.96 } : {}}
      onPointerMove={(e) => {
        if (!enabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.25);
        y.set((e.clientY - r.top - r.height / 2) * 0.35);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.button>
  );
}
