/**
 * Что именно шифруется. Название — часть шифротекста, а не метаданные на сервере:
 * открытое название тоже утечка.
 */
export interface NoteDocument {
  title: string;
  text: string;
}

const TYPE = 'cn-note';

export function serializeDocument(doc: NoteDocument): string {
  return JSON.stringify({ type: TYPE, v: 1, title: doc.title, text: doc.text });
}

/** Если расшифрованный текст не наш формат — показываем его целиком как текст. */
export function parseDocument(plaintext: string): NoteDocument {
  try {
    const value = JSON.parse(plaintext) as Record<string, unknown> | null;
    if (
      value !== null && typeof value === 'object' && value.type === TYPE && value.v === 1 &&
      typeof value.title === 'string' && typeof value.text === 'string'
    ) {
      return { title: value.title, text: value.text };
    }
  } catch {
    // не JSON
  }
  return { title: '', text: plaintext };
}

export function utf8Length(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(2)} МБ`;
}
