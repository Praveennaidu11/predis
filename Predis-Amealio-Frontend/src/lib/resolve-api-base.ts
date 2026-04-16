/**
 * Nest uses global prefix `/api` (not `/api/v1`). Normalizes env URLs.
 */
export function normalizeNestApiBase(input: string): string {
  let u = input.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) {
    u = `http://${u}`;
  }
  u = u.replace(/\/api\/v1\/?$/i, "/api");
  if (!/\/api$/i.test(u)) {
    try {
      const parsed = new URL(u);
      return `${parsed.origin}/api`;
    } catch {
      return "http://127.0.0.1:5000/api";
    }
  }
  return u;
}

export function resolveBrowserApiBase(): string {
  const fromBackend = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (fromBackend) {
    return normalizeNestApiBase(fromBackend);
  }
  const fromApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromApi) {
    return normalizeNestApiBase(fromApi);
  }
  return "/amealio-api";
}

export function resolveServerApiBase(): string {
  const internal =
    process.env.BACKEND_INTERNAL_URL?.trim() ||
    process.env.BACKEND_URL?.trim();
  if (internal) {
    return normalizeNestApiBase(internal);
  }
  const fromBackend = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (fromBackend) {
    return normalizeNestApiBase(fromBackend);
  }
  const fromApi = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (fromApi) {
    return normalizeNestApiBase(fromApi);
  }
  return "http://127.0.0.1:5000/api";
}
