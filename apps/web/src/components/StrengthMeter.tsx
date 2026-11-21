import { motion } from 'motion/react';
import { MIN_PASSWORD_LENGTH } from '@cn/crypto';
import { SPRING } from '../motion/prefs.js';

/**
 * Грубая оценка стойкости пароля: длина и разнообразие символов.
 * Это подсказка, а не проверка — проверяет только минимальная длина (FR-03).
 */
export function passwordScore(password: string): 0 | 1 | 2 | 3 | 4 {
  const length = [...password].length;
  if (length === 0) return 0;
  if (length < MIN_PASSWORD_LENGTH) return 1;
  let classes = 0;
  if (/[a-zа-яё]/.test(password)) classes++;
  if (/[A-ZА-ЯЁ]/.test(password)) classes++;
  if (/\d/.test(password)) classes++;
  if (/[^\p{L}\d]/u.test(password)) classes++;
  const bits = length * Math.log2([0, 26, 52, 62, 90][classes]! || 26);
  if (bits >= 80) return 4;
  if (bits >= 60) return 3;
  return 2;
}

const LABELS = ['', 'слишком короткий', 'средний', 'хороший', 'отличный'];
const COLORS = ['#d6d5d0', '#c0392b', '#d99a1e', '#3b8f5a', '#1f6b3a'];

export function StrengthMeter({ password }: { password: string }) {
  const score = passwordScore(password);
  return (
    <div className="strength" aria-live="polite">
      <div className="strength-track">
        {[1, 2, 3, 4].map((step) => (
          <motion.span
            key={step}
            className="strength-seg"
            initial={false}
            animate={{ scaleX: score >= step ? 1 : 0, backgroundColor: COLORS[score] ?? '#d6d5d0' }}
            transition={SPRING}
          />
        ))}
      </div>
      <span className="strength-label">{score ? `Пароль: ${LABELS[score]}` : ' '}</span>
    </div>
  );
}
