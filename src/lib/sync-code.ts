'use client';

const SYNC_CODE_KEY = 'triviaparty:sync-code';
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 8;

function canUseStorage() {
  return typeof window !== 'undefined';
}

function normalizeCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export function generateSyncCode() {
  let result = '';

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const random = new Uint8Array(CODE_LENGTH);
    crypto.getRandomValues(random);
    for (const value of random) {
      result += CODE_CHARS[value % CODE_CHARS.length];
    }
    return result;
  }

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    result += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }

  return result;
}

export function getSyncCode() {
  if (!canUseStorage()) return generateSyncCode();
  const existing = normalizeCode(window.localStorage.getItem(SYNC_CODE_KEY) ?? '');
  if (existing.length === CODE_LENGTH) {
    return existing;
  }
  const generated = generateSyncCode();
  window.localStorage.setItem(SYNC_CODE_KEY, generated);
  return generated;
}

export function setSyncCode(code: string) {
  const normalized = normalizeCode(code);
  if (!canUseStorage() || normalized.length !== CODE_LENGTH) return null;
  window.localStorage.setItem(SYNC_CODE_KEY, normalized);
  return normalized;
}
