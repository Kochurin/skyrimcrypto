import { useRef, useState } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from 'motion/react';
import { motionAllowed } from '../motion/prefs.js';
import { ParticleLock } from './ParticleLock.js';

/**
 * «Как это работает» — путь заметки, рассказанный прокруткой (иллюстрация к ЛР5–ЛР7).
 * Экран закрепляется, и по мере прокрутки идут 4 шага: пароль → ключ, текст → шифр,
 * на сервер — только шум, получатель собирает всё обратно.
 * При «уменьшить движение» — обычный список из четырёх карточек.
 */
const STAGES = [
  {
    tag: 'PBKDF2-SHA-256',
    title: 'Пароль превращается в ключ',
    text: 'Браузер 600 000 раз прогоняет пароль с солью через SHA-256. Получается 256-битный ключ — он не покидает вкладку',
  },
  {
    tag: 'AES-256-GCM',
    title: 'Текст превращается в шифр',
    text: 'Ключ шифрует заметку блоками по 16 байт. Тег целостности не даст незаметно изменить ни один байт',
  },
  {
    tag: 'Zero-Knowledge',
    title: 'Сервер получает только шум',
    text: 'На сервер уходят шифротекст, соль и IV. Ни пароля, ни ключа, ни текста — даже названия',
  },
  {
    tag: 'Получатель',
    title: 'И собирается обратно',
    text: 'Получатель вводит пароль, браузер выводит тот же ключ и расшифровывает. Неверный пароль — тег не сходится',
  },
];

const PLAIN = ['Встреча в', ' пятницу ', 'в 19:00 у', ' входа :)'];
const CIPHER = ['Xk3_q9Lm', 'Zr-8vTyQ', 'e2Hw_0Pa', 'N7bRuc4F'];

export function HowItWorks() {
  if (!motionAllowed()) return <StaticStory />;
  return <ScrollStory />;
}

function StaticStory() {
  return (
    <section className="how static" aria-labelledby="how-title">
      <h2 id="how-title">Как это работает</h2>
      <ol className="how-list">
        {STAGES.map((s, i) => (
          <li key={s.title}>
            <span className="mono">0{i + 1} · {s.tag}</span>
            <b>{s.title}</b>
            {s.text}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ScrollStory() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end end'] });
  const [stage, setStage] = useState(0);
  useMotionValueEvent(scrollYProgress, 'change', (p) => setStage(Math.min(3, Math.max(0, Math.floor(p * 4)))));

  return (
    <section ref={ref} className="how" aria-labelledby="how-title">
      <div className="how-sticky">
        <div className="how-intro">
          <ParticleLock />
          <div>
            <h2 id="how-title">Как это работает</h2>
            <p className="muted">Прокрутите — и посмотрите путь заметки от клавиатуры до получателя</p>
          </div>
        </div>
        <div className="how-grid">
          <ol className="how-steps">
            {STAGES.map((s, i) => (
              <motion.li key={s.title} animate={{ opacity: i === stage ? 1 : 0.35, x: i === stage ? 0 : -6 }} transition={{ duration: 0.3 }}>
                <span className="mono">0{i + 1} · {s.tag}</span>
                <b>{s.title}</b>
                <span className="how-text">{s.text}</span>
                {i === stage && <StageProgress progress={scrollYProgress} index={i} />}
              </motion.li>
            ))}
          </ol>
          <div className="how-visual" aria-hidden="true">
            <StageVisual stage={stage} progress={scrollYProgress} />
          </div>
        </div>
      </div>
    </section>
  );
}

function StageProgress({ progress, index }: { progress: MotionValue<number>; index: number }) {
  const scaleY = useTransform(progress, [index / 4, (index + 1) / 4], [0, 1], { clamp: true });
  return <motion.span className="how-bar" style={{ scaleY }} />;
}

function StageVisual({ stage, progress }: { stage: number; progress: MotionValue<number> }) {
  const iterations = useTransform(progress, [0.02, 0.22], [0, 600_000], { clamp: true });
  const [count, setCount] = useState(0);
  useMotionValueEvent(iterations, 'change', (v) => setCount(Math.round(v / 1000) * 1000));
  const flight = useTransform(progress, [0.52, 0.72], ['0%', '100%'], { clamp: true });

  return (
    <div className="vis">
      {stage === 0 && (
        <motion.div key="kdf" className="vis-kdf" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="vis-pill">пароль ••••••••••</div>
          <div className="vis-arrow">+ соль 16 байт</div>
          <div className="vis-counter">
            <span className="mono">SHA-256 ×</span>
            <b>{count.toLocaleString('ru-RU')}</b>
          </div>
          <div className="vis-key">
            {Array.from({ length: 32 }, (_, i) => (
              <motion.span key={i} animate={{ opacity: count >= ((i + 1) / 32) * 600_000 ? 1 : 0.15 }} className="vis-byte">
                {((i * 37 + 11) % 256).toString(16).padStart(2, '0')}
              </motion.span>
            ))}
          </div>
          <div className="vis-caption">ключ 256 бит · не экспортируется</div>
        </motion.div>
      )}
      {(stage === 1 || stage === 3) && (
        <motion.div key={`blocks-${stage}`} className="vis-blocks" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {PLAIN.map((p, i) => (
            <Block key={i} plain={p} cipher={CIPHER[i]!} encrypted={stage === 1} delay={i * 0.12} />
          ))}
          <div className="vis-caption">{stage === 1 ? 'AES-256-GCM · блоки по 16 байт + тег 128 бит' : '✓ тег сошёлся — текст подлинный'}</div>
        </motion.div>
      )}
      {stage === 2 && (
        <motion.div key="net" className="vis-net" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="vis-node">Браузер</div>
          <div className="vis-wire">
            <motion.div className="vis-packet mono" style={{ left: flight }}>
              Xk3_q9…
            </motion.div>
          </div>
          <div className="vis-node server">
            Сервер
            <span className="vis-sees">видит: шум</span>
            <span className="vis-no">пароль ✗ · ключ ✗ · текст ✗</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Block({ plain, cipher, encrypted, delay }: { plain: string; cipher: string; encrypted: boolean; delay: number }) {
  return (
    <div className="vis-block-wrap">
      <motion.div
        className="vis-block"
        initial={{ rotateX: encrypted ? 0 : 180 }}
        animate={{ rotateX: encrypted ? 180 : 0 }}
        transition={{ delay: 0.15 + delay, type: 'spring', stiffness: 120, damping: 14 }}
      >
        <span className="face front">{plain}</span>
        <span className="face back mono">{cipher}</span>
      </motion.div>
    </div>
  );
}
