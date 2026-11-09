// Prototype storage is separate from authenticated server data. Never cache API
// responses or tokens here: the existing keys are not scoped to a tenant.
export const prototypeStorage = {
  getItem(key: string): string | null { return localStorage.getItem(key) },
  setItem(key: string, value: string): void { localStorage.setItem(key, value) },
  removeItem(key: string): void { localStorage.removeItem(key) },
}
