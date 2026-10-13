// Native SQLite-backed localStorage is unavailable under Jest; use memory.
jest.mock("./src/lib/storage", () => {
  const data = new Map<string, string>();
  return {
    authStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  };
});
