/**
 * Central place to resolve the backend base URL.
 * Set NEXT_PUBLIC_API_URL in apps/frontend/.env.local (default: http://localhost:4000).
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "http://localhost:4000";

export function apiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_URL}${p}`;
}
