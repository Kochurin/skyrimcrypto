import { CryptoError } from './errors.js';

/**
 * base64url без паддинга (RFC 4648, §5). Работает и в браузере, и в Node
 * без Buffer: используются только btoa/atob.
 */

const CHUNK = 0x8000;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const BASE64URL_RE = /^[A-Za-z0-9_-]*$/;

export function fromBase64Url(text: string): Uint8Array {
  if (!BASE64URL_RE.test(text) || text.length % 4 === 1) {
    throw new CryptoError('INVALID_PACKAGE', 'Некорректная кодировка base64url.');
  }
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8Encode(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text) as Uint8Array<ArrayBuffer>;
}

export function utf8Decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}
