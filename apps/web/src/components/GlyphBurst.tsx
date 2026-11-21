import { motion } from 'motion/react';
import { useMemo } from 'react';
import { motionAllowed, randomGlyph } from '../motion/prefs.js';

/** Вспышка символов шифра, разлетающихся из центра (момент «заметка зашифрована»). */
export function GlyphBurst({ count = 18 }: { count?: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 70 + Math.random() * 90;
        return { ch: randomGlyph(), x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, rot: (Math.random() - 0.5) * 120, delay: Math.random() * 0.08 };
      }),
    [count],
  );
  if (!motionAllowed()) return null;
  return (
    <div className="burst" aria-hidden="true">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="burst-glyph"
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: [0, 1, 0], scale: [0.4, 1.1, 0.8], rotate: p.rot }}
          transition={{ duration: 1.1, delay: 0.15 + p.delay, ease: [0.16, 1, 0.3, 1] }}
        >
          {p.ch}
        </motion.span>
      ))}
    </div>
  );
}
