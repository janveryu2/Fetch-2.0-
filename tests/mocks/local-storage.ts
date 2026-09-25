export class MockLocalStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

export function setupMockLocalStorage(): MockLocalStorage {
  const mock = new MockLocalStorage();
  (globalThis as unknown as { localStorage: Storage }).localStorage = mock as unknown as Storage;
  (globalThis as unknown as { window: { localStorage: Storage } }).window = {
    localStorage: mock as unknown as Storage,
  };
  return mock;
}
