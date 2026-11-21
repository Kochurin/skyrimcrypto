import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { applyTheme } from './motion/theme.js';
import { registerServiceWorker } from './pwa.js';
import '@fontsource-variable/onest';
import '@fontsource/martian-mono/400.css';
import './styles.css';

// Тема — до первой отрисовки, чтобы не было вспышки светлой страницы
try {
  applyTheme(localStorage.getItem('sc-theme') === 'dark' ? 'dark' : 'light');
} catch {
  applyTheme('light');
}

const root = document.getElementById('root');
if (!root) throw new Error('Нет элемента #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
