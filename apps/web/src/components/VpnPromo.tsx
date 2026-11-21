import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SPRING_IN } from '../motion/prefs.js';
import { trackSpotlight } from './Interactive.js';

/**
 * Ненавязчивое упоминание SkyrimVPN — другого проекта автора.
 * Ссылки с меткой `crypto`, чтобы в статистике бота было видно, откуда пришёл человек.
 * Блок скрывается крестиком; это единственное, что сайт хранит в localStorage
 * (флаг «скрыто» — не секрет и не данные заметок).
 * Ссылки открываются без Referer (meta referrer = no-referrer): адрес заметки наружу не уходит.
 */
const BOT_URL = 'https://t.me/SkyrimVPN_bot?start=crypto';
const SITE_URL = 'https://skyrim.connecto.lol/?utm_source=crypto';
const HIDDEN_KEY = 'sc-vpn-promo-hidden';

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function VpnPromo() {
  const [hidden, setHidden] = useState(readHidden);

  function hide() {
    setHidden(true);
    try {
      localStorage.setItem(HIDDEN_KEY, '1');
    } catch {
      // приватный режим — просто скрываем до перезагрузки
    }
  }

  return (
    <AnimatePresence>
      {!hidden && (
        <motion.aside
          className="vpn-promo spot"
          aria-label="Другой проект автора: SkyrimVPN"
          onPointerMove={trackSpotlight}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
          transition={SPRING_IN}
        >
          <img className="vpn-logo" src="/skyrimvpn.png" alt="" width={44} height={44} />
          <div className="vpn-text">
            <b>SkyrimVPN</b>
            <span>Мой VPN в Telegram — работает и на мобильном интернете</span>
          </div>
          <div className="vpn-actions">
            <a className="pill-link primary-link" href={BOT_URL} target="_blank" rel="noopener noreferrer">
              Открыть бота
            </a>
            <a className="pill-link" href={SITE_URL} target="_blank" rel="noopener noreferrer">
              Сайт
            </a>
          </div>
          <button type="button" className="vpn-close" onClick={hide} aria-label="Скрыть блок SkyrimVPN">
            ×
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
