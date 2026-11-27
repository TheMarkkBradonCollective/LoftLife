/**
 * Resolve catalog asset URLs for both local development and R2 production.
 *
 * Development: paths are served from public/ (`/models/...`, `/catalog-previews/...`).
 * Production: set VITE_ASSET_BASE_URL to the R2 public bucket or CDN root that
 * mirrors the same layout (`.../catalog/v1`). No other code changes.
 */
const BASE = (() => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    return (env?.VITE_ASSET_BASE_URL ?? '').replace(/\/+$/, '');
  } catch {
    return '';
  }
})();

export function assetUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return '';
  if (/^(https?:)?\/\//.test(pathOrUrl) || pathOrUrl.startsWith('data:')) return pathOrUrl;
  if (!BASE) return pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${BASE}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
}

export const ASSET_BASE_URL = BASE;
