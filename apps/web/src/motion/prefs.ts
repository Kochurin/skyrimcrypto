import { MotionGlobalConfig } from 'motion/react';

/**
 * Можно ли анимировать. Уважает системную настройку «уменьшить движение»
 * (prefers-reduced-motion) и глобальный выключатель Motion (его включают тесты).
 */
export function motionAllowed(): boolean {
  if (MotionGlobalConfig.skipAnimations) return false;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Символы «шифра»: base64url — именно так выглядит настоящий шифротекст пакета. */
export const CIPHER_GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function randomGlyph(): string {
  return CIPHER_GLYPHS[Math.floor(Math.random() * CIPHER_GLYPHS.length)]!;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Пружина для «живых» элементов и быстрая кривая для выхода (выход быстрее входа). */
export const SPRING = { type: 'spring', stiffness: 380, damping: 30, mass: 0.8 } as const;
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
export const EASE_IN = [0.7, 0, 0.84, 0] as const;

/** Пружина для появления: движение — пружиной, прозрачность — быстро и ровно. */
export const SPRING_IN = { ...SPRING, opacity: { duration: 0.25 } } as const;
