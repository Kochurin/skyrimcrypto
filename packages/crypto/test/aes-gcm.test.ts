import { createCipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hex, toHex } from './helpers.js';

/**
 * FR-04, тест на эталонных векторах: AES-256-GCM в Web Crypto API
 * сверяется с опубликованным вектором из спецификации GCM (McGrew–Viega,
 * Test Case 15 — AES-256, IV 96 бит, без AAD) и с независимой реализацией OpenSSL.
 */
async function webcryptoEncrypt(key: Uint8Array<ArrayBuffer>, iv: Uint8Array<ArrayBuffer>, pt: Uint8Array<ArrayBuffer>, aad?: Uint8Array<ArrayBuffer>) {
  const k = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const params: AesGcmParams = { name: 'AES-GCM', iv, tagLength: 128 };
  if (aad) params.additionalData = aad;
  return new Uint8Array(await crypto.subtle.encrypt(params, k, pt));
}

describe('AES-256-GCM: эталонные векторы', () => {
  it('GCM Test Case 15 (AES-256)', async () => {
    const key = hex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308');
    const iv = hex('cafebabefacedbaddecaf888');
    const pt = hex(
      'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72' +
        '1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255',
    );
    const ct =
      '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa' +
      '8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad';
    const tag = 'b094dac5d93471bdec1a502270e3cc6c';
    const out = await webcryptoEncrypt(key, iv, pt);
    expect(toHex(out)).toBe(ct + tag);
  });

  it('совпадает с OpenSSL (node:crypto) на случайных данных с AAD', async () => {
    for (let i = 0; i < 5; i++) {
      const key = new Uint8Array(randomBytes(32));
      const iv = new Uint8Array(randomBytes(12));
      const pt = new Uint8Array(randomBytes(100 + i * 37));
      const aad = new Uint8Array(randomBytes(20));
      const ours = await webcryptoEncrypt(key, iv, pt, aad);
      const c = createCipheriv('aes-256-gcm', key, iv);
      c.setAAD(aad);
      const ref = Buffer.concat([c.update(pt), c.final(), c.getAuthTag()]);
      expect(toHex(ours)).toBe(ref.toString('hex'));
    }
  });
});
