import { useCallback, useEffect, useState } from 'react';
import { motionAllowed } from './prefs.js';

/**
 * Светлая / тёмная тема. Выбор хранится в localStorage (это настройка, не секрет).
 * Переключение — круговое проявление новой темы от кнопки (View Transitions API);
 * где API нет или включено «уменьшить движение» — мгновенно.
 */
export type Theme = 'light' | 'dark';
const KEY = 'sc-theme';

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // нет доступа к хранилищу
  }
  return 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

type DocWithVT = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // приватный режим
    }
  }, [theme]);

  const toggle = useCallback(
    (origin?: { x: number; y: number }) => {
      const next: Theme = theme === 'light' ? 'dark' : 'light';
      const doc = document as DocWithVT;
      if (!doc.startViewTransition || !motionAllowed() || !origin) {
        setTheme(next);
        return;
      }
      const { x, y } = origin;
      const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const transition = doc.startViewTransition(() => {
        applyTheme(next); // синхронно: снимок «после» уже в новой теме
        setTheme(next);
      });
      void transition.ready.then(() => {
        document.documentElement.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 650, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      });
    },
    [theme],
  );

  return { theme, toggle };
}

// ---------- Звук щелчка замка (по умолчанию выключен) ----------

const SOUND_KEY = 'sc-sound';

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === '1';
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    // приватный режим
  }
}

let audio: AudioContext | null = null;

/** Короткий механический щелчок, синтезированный Web Audio (без звуковых файлов). */
export function playLockClick() {
  if (!soundEnabled() || typeof AudioContext === 'undefined') return;
  audio ??= new AudioContext();
  const ctx = audio;
  const now = ctx.currentTime;
  const click = (at: number, freq: number, gain: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, now + at);
    osc.frequency.exponentialRampToValueAtTime(freq / 3, now + at + 0.05);
    g.gain.setValueAtTime(gain, now + at);
    g.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.06);
    osc.connect(g).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.07);
  };
  click(0, 1800, 0.05);
  click(0.07, 900, 0.07);
}
