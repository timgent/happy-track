export interface AppSession {
  fetch: typeof globalThis.fetch;
  info: { isLoggedIn: boolean; webId?: string };
}
