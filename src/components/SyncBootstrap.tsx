'use client';

import { useEffect } from 'react';
import { pullProgressFromFirestore } from '@/lib/firebase-sync';
import { getSyncCode } from '@/lib/sync-code';

const SESSION_PULL_KEY = 'triviaparty:sync:last-pull';

export default function SyncBootstrap() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.sessionStorage.getItem(SESSION_PULL_KEY)) return;
    window.sessionStorage.setItem(SESSION_PULL_KEY, new Date().toISOString());
    void pullProgressFromFirestore(getSyncCode());
  }, []);

  return null;
}
