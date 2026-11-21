import { useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { motionAllowed } from '../motion/prefs.js';

const INTERACTIVE = 'a, button, input, textarea, select, label, [role="tab"]';

/**
 * «Курсор-ключ»: над кнопками и полями рядом с курсором появляется ключ,
 * при нажатии он поворачивается, как в замке. Обычный курсор не скрывается.
 * Только для мыши (pointer: fine) и только если движение разрешено.
 */
export function KeyCursor() {
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState(false);
  const [pressed, setPressed] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const sx = useSpring(x, { stiffness: 600, damping: 40, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 600, damping: 40, mass: 0.4 });

  useEffect(() => {
    const fine = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    if (!fine || !motionAllowed()) return;
    setEnabled(true);

    const move = (e: PointerEvent) => {
      x.set(e.clientX + 14);
      y.set(e.clientY + 16);
      const target = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null;
      setActive(!!target && !(target as HTMLButtonElement).disabled);
    };
    const down = () => setPressed(true);
    const up = () => setPressed(false);
    const leave = () => setActive(false);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    document.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      document.removeEventListener('pointerleave', leave);
    };
  }, [x, y]);

  if (!enabled) return null;
  return (
    <motion.div className="key-cursor" aria-hidden="true" style={{ x: sx, y: sy }}>
      <motion.svg
        viewBox="0 0 24 24"
        width="22"
        height="22"
        initial={false}
        animate={{ opacity: active ? 1 : 0, scale: active ? 1 : 0.4, rotate: pressed ? 90 : -35 }}
        transition={{ type: 'spring', stiffness: 500, damping: 26 }}
      >
        <circle cx="7" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.2" />
        <path d="M11 12h10M17 12v3.5M20 12v2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </motion.svg>
    </motion.div>
  );
}
