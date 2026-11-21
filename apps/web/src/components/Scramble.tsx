import { createElement, useEffect, useRef, useState, type ElementType } from 'react';
import { motionAllowed, randomGlyph } from '../motion/prefs.js';

interface Props {
  /** Итоговый текст. При его смене текст «перешифровывается» из текущего вида в новый. */
  text: string;
  as?: ElementType;
  className?: string;
  /** Длительность волны, мс. */
  duration?: number;
  /** Начать с «шифра» (случайных символов), а не с готового текста. */
  fromCipher?: boolean;
  /** Задержка старта, мс. */
  delay?: number;
}

/** Дольше этого не анимируем посимвольно: длинные заметки просто появляются. */
const MAX_ANIMATED = 1800;

/**
 * Эффект «расшифровки»: символы перебирают случайные знаки base64url
 * и по волне слева направо встают на место.
 * Доступность: настоящий текст лежит в скрытом для глаз узле (его читают
 * скринридеры и поиск по странице), анимация — aria-hidden.
 */
export function Scramble({ text, as = 'span', className, duration = 900, fromCipher = false, delay = 0 }: Props) {
  const animate = motionAllowed() && text.length <= MAX_ANIMATED;
  const [display, setDisplay] = useState(() => (animate && fromCipher ? cipherOf(text) : text));
  const shownRef = useRef(display);
  shownRef.current = display;

  useEffect(() => {
    if (!animate) {
      setDisplay(text);
      return;
    }
    const from = shownRef.current;
    if (from === text) return;

    const length = Math.max(from.length, text.length);
    // Момент, когда каждый символ «встаёт на место»: волна + немного случайности.
    const settleAt = Array.from({ length }, (_, i) => (i / Math.max(length, 1)) * duration * 0.75 + Math.random() * duration * 0.25);
    let raf = 0;
    let start = 0;
    let lastFrame = 0;

    const tick = (now: number) => {
      if (!start) start = now + delay;
      const t = now - start;
      if (t >= 0 && now - lastFrame > 32) {
        // ~30 кадров в секунду достаточно: символы и так мелькают
        lastFrame = now;
        let out = '';
        for (let i = 0; i < length; i++) {
          const target = text[i] ?? '';
          if (t >= settleAt[i]!) out += target;
          else if (target === ' ' || target === '\n') out += target;
          else out += randomGlyph();
        }
        setDisplay(out);
      }
      if (t < duration) raf = requestAnimationFrame(tick);
      else setDisplay(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, animate, duration, delay]);

  // Текст уже на месте — обычный текстовый узел (его можно выделить и скопировать).
  if (display === text) return createElement(as, { className }, text);

  return createElement(
    as,
    { className },
    <span className="sr-only">{text}</span>,
    <span aria-hidden="true" className="scramble">
      {display}
    </span>,
  );
}

/** Строка той же формы из случайных символов (пробелы и переводы строк сохраняются). */
export function cipherOf(text: string): string {
  let out = '';
  for (const ch of text) out += ch === ' ' || ch === '\n' ? ch : randomGlyph();
  return out;
}
