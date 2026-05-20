'use client';

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { getSyncCode } from '@/lib/sync-code';

const USERS_KEY = 'triviaparty:users';
const ACTIVE_USER_KEY = 'triviaparty:active-user';
const USER_PREFIX = 'triviaparty:user:';
const OVERALL_KEY = 'triviaparty:local:overall';
const EPISODES_KEY = 'triviaparty:local:episodes';
const CLUES_KEY = 'triviaparty:local:clues';

interface SyncedProgressDoc {
  users: unknown;
  activeUser: unknown;
  userRecords: Record<string, unknown>;
  localOverall: unknown;
  localEpisodes: unknown;
  localClues: unknown;
  updatedAt: string;
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

function canUseStorage() {
  return typeof window !== 'undefined';
}

function readStorageJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorageJsonIfChanged(key: string, value: unknown) {
  if (!canUseStorage()) return false;
  const next = JSON.stringify(value);
  if (window.localStorage.getItem(key) === next) return false;
  window.localStorage.setItem(key, next);
  return true;
}

function collectUserRecords() {
  if (!canUseStorage()) return {};
  const records: Record<string, unknown> = {};
  const users = readStorageJson<Array<{ username?: string }>>(USERS_KEY, []);
  for (const user of users) {
    if (!user?.username) continue;
    const key = `${USER_PREFIX}${user.username.toLowerCase()}`;
    records[key] = readStorageJson<unknown>(key, null);
  }
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key?.startsWith(USER_PREFIX) || key in records) continue;
    records[key] = readStorageJson<unknown>(key, null);
  }
  return records;
}

function warnConfigMissing() {
  console.warn('[sync] Firebase env vars are not set. Skipping cloud sync.');
}

function normalizeSyncCode(syncCode: string) {
  return syncCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

function buildPayload(): SyncedProgressDoc {
  return {
    users: readStorageJson(USERS_KEY, []),
    activeUser: canUseStorage() ? window.localStorage.getItem(ACTIVE_USER_KEY) : null,
    userRecords: collectUserRecords(),
    localOverall: readStorageJson(OVERALL_KEY, {}),
    localEpisodes: readStorageJson(EPISODES_KEY, {}),
    localClues: readStorageJson(CLUES_KEY, {}),
    updatedAt: new Date().toISOString(),
  };
}

export async function pushProgressToFirestore(syncCode: string) {
  if (!canUseStorage()) return;
  if (!db || !isFirebaseConfigured) {
    warnConfigMissing();
    return;
  }
  const normalizedCode = normalizeSyncCode(syncCode);
  if (!normalizedCode) return;

  try {
    await setDoc(doc(db, 'users', normalizedCode), buildPayload(), { merge: true });
  } catch (error) {
    console.warn('[sync] Failed to push progress to Firestore.', error);
  }
}

export async function pullProgressFromFirestore(syncCode: string) {
  if (!canUseStorage()) return;
  if (!db || !isFirebaseConfigured) {
    warnConfigMissing();
    return;
  }
  const normalizedCode = normalizeSyncCode(syncCode);
  if (!normalizedCode) return;

  try {
    const snapshot = await getDoc(doc(db, 'users', normalizedCode));
    if (!snapshot.exists()) return;
    const remote = snapshot.data() as Partial<SyncedProgressDoc>;
    let changed = false;

    const mergedUsers = [
      ...readStorageJson<Array<{ username: string; createdAt: string }>>(USERS_KEY, []),
      ...(Array.isArray(remote.users) ? (remote.users as Array<{ username: string; createdAt: string }>) : []),
    ].reduce<Array<{ username: string; createdAt: string }>>((acc, user) => {
      if (!user?.username) return acc;
      const existingIndex = acc.findIndex(item => item.username.toLowerCase() === user.username.toLowerCase());
      if (existingIndex >= 0) {
        acc[existingIndex] = user;
      } else {
        acc.push(user);
      }
      return acc;
    }, []);
    changed = writeStorageJsonIfChanged(USERS_KEY, mergedUsers) || changed;

    if (typeof remote.activeUser === 'string' || remote.activeUser === null) {
      const current = window.localStorage.getItem(ACTIVE_USER_KEY);
      const next = remote.activeUser;
      if (next === null && current !== null) {
        window.localStorage.removeItem(ACTIVE_USER_KEY);
        changed = true;
      } else if (typeof next === 'string' && current !== next) {
        window.localStorage.setItem(ACTIVE_USER_KEY, next);
        changed = true;
      }
    }

    if (remote.userRecords && typeof remote.userRecords === 'object') {
      const entries = Object.entries(remote.userRecords);
      for (const [key, value] of entries) {
        if (!key.startsWith(USER_PREFIX) || !value) continue;
        changed = writeStorageJsonIfChanged(key, value) || changed;
      }
    }

    if (remote.localOverall && typeof remote.localOverall === 'object') {
      changed = writeStorageJsonIfChanged(OVERALL_KEY, {
        ...readStorageJson<Record<string, unknown>>(OVERALL_KEY, {}),
        ...(remote.localOverall as Record<string, unknown>),
      }) || changed;
    }
    if (remote.localEpisodes && typeof remote.localEpisodes === 'object') {
      changed = writeStorageJsonIfChanged(EPISODES_KEY, {
        ...readStorageJson<Record<string, unknown>>(EPISODES_KEY, {}),
        ...(remote.localEpisodes as Record<string, unknown>),
      }) || changed;
    }
    if (remote.localClues && typeof remote.localClues === 'object') {
      changed = writeStorageJsonIfChanged(CLUES_KEY, {
        ...readStorageJson<Record<string, unknown>>(CLUES_KEY, {}),
        ...(remote.localClues as Record<string, unknown>),
      }) || changed;
    }

    if (changed) {
      window.dispatchEvent(new Event('triviaparty:sync-updated'));
      window.location.reload();
    }
  } catch (error) {
    console.warn('[sync] Failed to pull progress from Firestore.', error);
  }
}

export function scheduleProgressPush(syncCode = getSyncCode(), delayMs = 2000) {
  if (!canUseStorage()) return;
  const normalizedCode = normalizeSyncCode(syncCode);
  if (!normalizedCode) return;
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(() => {
    void pushProgressToFirestore(normalizedCode);
  }, delayMs);
}
