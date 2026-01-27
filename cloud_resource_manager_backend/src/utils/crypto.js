const crypto = require('crypto');
const { getRequiredEnv } = require('../config/env');

const MAGIC = Buffer.from('CRM1'); // 4 bytes
const IV_LENGTH = 12; // recommended for GCM
const TAG_LENGTH = 16; // auth tag length

let cachedKey = null;

function parseEncryptionKey(raw) {
  // Prefer base64 (recommended), but allow hex/raw 32 bytes for local dev.
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  const base64Buf = Buffer.from(trimmed, 'base64');
  if (base64Buf.length === 32) return base64Buf;

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    const hexBuf = Buffer.from(trimmed, 'hex');
    if (hexBuf.length === 32) return hexBuf;
  }

  const utf8Buf = Buffer.from(trimmed, 'utf8');
  if (utf8Buf.length === 32) return utf8Buf;

  return null;
}

function getEncryptionKey() {
  if (cachedKey) return cachedKey;

  const raw = getRequiredEnv('CREDENTIAL_ENCRYPTION_KEY');
  const key = parseEncryptionKey(raw);

  if (!key) {
    throw new Error(
      'Invalid CREDENTIAL_ENCRYPTION_KEY. Provide a 32-byte key (recommended: base64-encoded 32 bytes).'
    );
  }

  cachedKey = key;
  return cachedKey;
}

/**
 * PUBLIC_INTERFACE
 * Encrypt a JSON-serializable value using AES-256-GCM.
 * Stored format (binary):
 *   MAGIC(4) + IV(12) + TAG(16) + CIPHERTEXT(n)
 * @param {any} value JSON-serializable value
 * @returns {Buffer} encrypted payload
 */
function encryptJson(value) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, iv, tag, ciphertext]);
}

/**
 * PUBLIC_INTERFACE
 * Decrypt a payload created by encryptJson().
 * @param {Buffer} payload encrypted payload
 * @returns {any} decrypted value
 */
function decryptJson(payload) {
  const key = getEncryptionKey();
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);

  if (buf.length < MAGIC.length + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Encrypted payload is too short');
  }

  const magic = buf.subarray(0, MAGIC.length);
  if (!magic.equals(MAGIC)) {
    throw new Error('Encrypted payload has invalid header');
  }

  const ivStart = MAGIC.length;
  const tagStart = ivStart + IV_LENGTH;
  const dataStart = tagStart + TAG_LENGTH;

  const iv = buf.subarray(ivStart, tagStart);
  const tag = buf.subarray(tagStart, dataStart);
  const ciphertext = buf.subarray(dataStart);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

module.exports = {
  encryptJson,
  decryptJson,
};
