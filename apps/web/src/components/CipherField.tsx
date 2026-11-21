import { useEffect, useRef } from 'react';
import { CIPHER_GLYPHS, motionAllowed } from '../motion/prefs.js';

/**
 * Фон «поле шифра»: сетка символов base64url, которые медленно мерцают.
 * Возле курсора символы темнеют, подсвечиваются зелёным и «расшифровываются»
 * в буквы фразы — как будто курсор держит ключ.
 * Canvas, ~30 кадров/с, пауза в фоновой вкладке; при reduced-motion — статичная картинка.
 */
const CELL = 22;
const PHRASE = 'ZERO KNOWLEDGE · AES-256-GCM · PBKDF2 · ';
const RADIUS = 150;

export function CipherField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const animated = motionAllowed();
    let cols = 0;
    let rows = 0;
    let glyphs: string[] = [];
    let width = 0;
    let height = 0;
    const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999 };

    // Цвета берутся из темы (--glyph, --accent-rgb) и обновляются при её смене
    const readPalette = () => {
      const st = getComputedStyle(document.documentElement);
      return { ink: st.getPropertyValue('--glyph').trim() || '21, 21, 19', accent: st.getPropertyValue('--accent-rgb').trim() || '31, 107, 58' };
    };
    let palette = readPalette();
    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const pick = () => CIPHER_GLYPHS[Math.floor(Math.random() * CIPHER_GLYPHS.length)]!;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas!.width = Math.round(width * dpr);
      canvas!.height = Math.round(height * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(width / CELL) + 1;
      rows = Math.ceil(height / CELL) + 1;
      glyphs = Array.from({ length: cols * rows }, pick);
      draw();
    }

    function draw() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.font = '500 12px "Martian Mono", ui-monospace, monospace';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      // Мягкое движение «линзы» за курсором
      pointer.x += (pointer.tx - pointer.x) * 0.18;
      pointer.y += (pointer.ty - pointer.y) * 0.18;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * CELL + CELL / 2;
          const y = r * CELL + CELL / 2;
          const d = Math.hypot(x - pointer.x, y - pointer.y);
          const near = Math.max(0, 1 - d / RADIUS); // 0…1
          const i = r * cols + c;
          let ch = glyphs[i]!;
          if (near > 0.55) ch = PHRASE[(r * 7 + c) % PHRASE.length]!; // «расшифровано»
          if (near > 0.02) {
            ctx!.fillStyle = `rgba(${palette.accent}, ${0.12 + near * 0.75})`;
          } else {
            ctx!.fillStyle = `rgba(${palette.ink}, 0.075)`;
          }
          ctx!.fillText(ch, x, y);
        }
      }
    }

    let raf = 0;
    let last = 0;
    function loop(now: number) {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 33) return;
      last = now;
      // Мерцание: каждый кадр меняется ~1,5 % символов
      const changes = Math.ceil(glyphs.length * 0.015);
      for (let k = 0; k < changes; k++) glyphs[Math.floor(Math.random() * glyphs.length)] = pick();
      draw();
    }

    function onMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      pointer.tx = e.clientX - rect.left;
      pointer.ty = e.clientY - rect.top;
      if (pointer.x < -1000) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
    }
    function onLeave() {
      pointer.tx = -9999;
      pointer.ty = -9999;
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    if (animated) {
      raf = requestAnimationFrame(loop);
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} className="cipher-field" aria-hidden="true" />;
}
