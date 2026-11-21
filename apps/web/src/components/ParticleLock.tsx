import { useEffect, useRef } from 'react';
import { motionAllowed } from '../motion/prefs.js';

/**
 * Замок из частиц (2D canvas, без WebGL и тяжёлых библиотек).
 * Частицы-символы слетаются в форму замка, когда блок появляется на экране,
 * разбегаются от курсора и рассыпаются, если быстро прокручивать страницу.
 * При «уменьшить движение» — сразу собранный статичный замок.
 */
const W = 360;
const H = 360;

function lockPoints(count: number): { x: number; y: number }[] {
  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const c = off.getContext('2d');
  if (!c) return [];
  c.fillStyle = '#000';
  c.strokeStyle = '#000';
  // Дужка
  c.lineWidth = 30;
  c.beginPath();
  c.arc(W / 2, 150, 70, Math.PI, 0);
  c.lineTo(W / 2 + 70, 175);
  c.moveTo(W / 2 - 70, 150);
  c.lineTo(W / 2 - 70, 175);
  c.stroke();
  // Корпус
  c.beginPath();
  c.roundRect(W / 2 - 115, 170, 230, 160, 30);
  c.fill();
  // Скважина — вырезаем
  c.globalCompositeOperation = 'destination-out';
  c.beginPath();
  c.arc(W / 2, 235, 18, 0, Math.PI * 2);
  c.fill();
  c.fillRect(W / 2 - 7, 240, 14, 48);

  const data = c.getImageData(0, 0, W, H).data;
  const inside: { x: number; y: number }[] = [];
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      if (data[(y * W + x) * 4 + 3]! > 128) inside.push({ x, y });
    }
  }
  // Равномерная выборка нужного числа точек
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) out.push(inside[Math.floor((i / count) * inside.length)]!);
  return out;
}

export function ParticleLock() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const animated = motionAllowed();
    const targets = lockPoints(animated ? 700 : 900);
    const glyphs = 'ABCDEF0123456789';
    const parts = targets.map((t) => ({
      tx: t.x,
      ty: t.y,
      x: animated ? Math.random() * W : t.x,
      y: animated ? Math.random() * H : t.y,
      vx: 0,
      vy: 0,
      ch: glyphs[Math.floor(Math.random() * glyphs.length)]!,
    }));
    const mouse = { x: -999, y: -999 };
    let assembled = !animated;
    let lastScroll = window.scrollY;
    let raf = 0;

    const color = () => {
      const s = getComputedStyle(document.documentElement);
      return { ink: s.getPropertyValue('--glyph').trim() || '21, 21, 19', accent: s.getPropertyValue('--accent-rgb').trim() || '31, 107, 58' };
    };
    let palette = color();
    const themeObserver = new MutationObserver(() => {
      palette = color();
      if (!animated) draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      ctx!.font = '600 8px "Martian Mono", ui-monospace, monospace';
      ctx!.textAlign = 'center';
      ctx!.textBaseline = 'middle';
      for (const p of parts) {
        const settled = Math.hypot(p.x - p.tx, p.y - p.ty) < 3;
        ctx!.fillStyle = settled ? `rgba(${palette.ink}, 0.85)` : `rgba(${palette.accent}, 0.8)`;
        ctx!.fillText(p.ch, p.x, p.y);
      }
    }

    function step() {
      raf = requestAnimationFrame(step);
      // Быстрая прокрутка «встряхивает» замок
      const dy = window.scrollY - lastScroll;
      lastScroll = window.scrollY;
      const shake = Math.min(Math.abs(dy), 60) * 0.06;
      for (const p of parts) {
        if (assembled) {
          p.vx += (p.tx - p.x) * 0.045;
          p.vy += (p.ty - p.y) * 0.045;
        }
        const d = Math.hypot(p.x - mouse.x, p.y - mouse.y);
        if (d < 60) {
          const f = (60 - d) / 60;
          p.vx += ((p.x - mouse.x) / (d || 1)) * f * 4;
          p.vy += ((p.y - mouse.y) / (d || 1)) * f * 4;
        }
        if (shake) {
          p.vx += (Math.random() - 0.5) * shake;
          p.vy += (Math.random() - 0.5) * shake;
        }
        p.vx *= 0.82;
        p.vy *= 0.82;
        p.x += p.vx;
        p.y += p.vy;
        if (Math.random() < 0.004) p.ch = glyphs[Math.floor(Math.random() * glyphs.length)]!;
      }
      draw();
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          assembled = true;
          if (animated && !raf) raf = requestAnimationFrame(step);
        } else if (animated) {
          // ушёл с экрана — рассыпаем и останавливаем, чтобы не тратить батарею
          cancelAnimationFrame(raf);
          raf = 0;
          assembled = false;
          for (const p of parts) {
            p.x = Math.random() * W;
            p.y = Math.random() * H;
          }
        }
      },
      { threshold: 0.3 },
    );
    io.observe(canvas);

    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - r.left) / r.width) * W;
      mouse.y = ((e.clientY - r.top) / r.height) * H;
    };
    const leave = () => {
      mouse.x = -999;
      mouse.y = -999;
    };
    if (animated) {
      canvas.addEventListener('pointermove', move);
      canvas.addEventListener('pointerleave', leave);
    }
    draw();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerleave', leave);
    };
  }, []);

  return <canvas ref={ref} className="particle-lock" aria-hidden="true" />;
}
