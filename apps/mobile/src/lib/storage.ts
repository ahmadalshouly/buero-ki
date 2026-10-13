// Web uses the browser's own localStorage.
export const authStorage = typeof window === "undefined" ? undefined : window.localStorage;
