import { generateSyncCode, getSyncCode, setSyncCode } from '@/lib/sync-code';

type Store = Record<string, string>;

function mockWindow() {
  const store: Store = {};
  const localStorage = {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const key of Object.keys(store)) delete store[key];
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage },
  });
}

describe('sync code utilities', () => {
  beforeEach(() => {
    mockWindow();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'window');
  });

  it('generates an 8-character uppercase alphanumeric code', () => {
    const code = generateSyncCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
  });

  it('creates and stores a code on first access', () => {
    const code = getSyncCode();
    expect(code).toMatch(/^[A-Z0-9]{8}$/);
    expect(window.localStorage.getItem('triviaparty:sync-code')).toBe(code);
  });

  it('accepts a custom sync code and normalizes it', () => {
    const updated = setSyncCode('ab12-cd34');
    expect(updated).toBe('AB12CD34');
    expect(getSyncCode()).toBe('AB12CD34');
  });

  it('rejects invalid custom sync code length', () => {
    expect(setSyncCode('ABC')).toBeNull();
  });
});
