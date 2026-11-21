import '@testing-library/jest-dom/vitest';
import { MotionGlobalConfig } from 'motion/react';

// Анимации выключены: тесты проверяют поведение, а не движение (как при prefers-reduced-motion).
MotionGlobalConfig.skipAnimations = true;

// В jsdom нет IntersectionObserver (нужен для «появления при прокрутке»): пустая заглушка.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  class NoopIntersectionObserver {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  globalThis.IntersectionObserver = NoopIntersectionObserver as unknown as typeof IntersectionObserver;
}
