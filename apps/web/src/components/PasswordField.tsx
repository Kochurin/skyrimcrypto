import { useId, useState } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password' | 'off';
  disabled?: boolean;
  autoFocus?: boolean;
}

/** Поле пароля с кнопкой «показать». Значение живёт только в состоянии React. */
export function PasswordField({ label, value, onChange, autoComplete, disabled = false, autoFocus = false }: Props) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="inline">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="off"
          disabled={disabled}
          autoFocus={autoFocus}
        />
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
