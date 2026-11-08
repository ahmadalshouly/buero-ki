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

// Since SDK 58 expo-notifications subscribes a default handler on import, and
// jest-expo's mocked listener has no remove(), so replacing the handler throws.
jest.mock("expo-notifications", () => ({
  ...jest.requireActual("expo-notifications"),
  setNotificationHandler: jest.fn(),
}));
