'use client';

import { useEffect } from 'react';
import { pullProgressFromFirestore } from '@/lib/firebase-sync';
import { getSyncCode } from '@/lib/sync-code';

export default function SyncBootstrap() {
  useEffect(() => {
    void pullProgressFromFirestore(getSyncCode());
  }, []);

  return null;
}
