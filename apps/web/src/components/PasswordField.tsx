import { useEffect, useId, useRef, useState } from 'react';
import { motionAllowed, randomGlyph } from '../motion/prefs.js';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password' | 'current-password' | 'off';
  disabled?: boolean;
  autoFocus?: boolean;
}

/** Сколько миллисекунд новый символ «мерцает» шифром, прежде чем стать точкой. */
const FLASH_MS = 420;

/**
 * Поле пароля с кнопкой «показать». Значение живёт только в состоянии React.
 * Поле остаётся настоящим type="password" (менеджеры паролей, запрет копирования);
 * поверх него рисуется маска: только что набранный символ на миг показывается
 * случайным знаком base64url и гаснет в точку. Настоящий символ не показывается никогда.
 */
export function PasswordField({ label, value, onChange, autoComplete, disabled = false, autoFocus = false }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const [flash, setFlash] = useState<{ index: number; glyph: string } | null>(null);
  const [scroll, setScroll] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const fancy = motionAllowed() && !visible;
  const length = [...value].length;

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="inline">
        <div className={fancy ? 'pw-wrap fancy' : 'pw-wrap'}>
          <input
            ref={inputRef}
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={(e) => {
              const next = e.target.value;
              const grew = [...next].length > length;
              onChange(next);
              if (fancy && grew) setFlash({ index: [...next].length - 1, glyph: randomGlyph() });
            }}
            onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
            autoComplete={autoComplete}
            spellCheck={false}
            autoCapitalize="off"
            disabled={disabled}
            autoFocus={autoFocus}
          />
          {fancy && length > 0 && (
            <span className="pw-mask" aria-hidden="true" style={{ transform: `translateX(${-scroll}px)` }}>
              {Array.from({ length }, (_, i) =>
                flash && flash.index === i ? (
                  <span key={i} className="pw-glyph">
                    {flash.glyph}
                  </span>
                ) : (
                  <span key={i} className="pw-dot">
                    •
                  </span>
                ),
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Скрыть: ${label}` : `Показать: ${label}`}
          disabled={disabled}
        >
          {visible ? 'Скрыть' : 'Показать'}
        </button>
      </div>
    </div>
  );
}
