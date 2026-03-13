/**
 * API Key utilities for developer apps
 * Uses Web Crypto API (not Node.js crypto) for Cloudflare Workers compatibility
 */

/**
 * Generate a new API key with 'ak_' prefix
 * Format: ak_{uuid}
 */
export function generateApiKey(): string {
  return `ak_${crypto.randomUUID()}`;
}

/**
 * Hash API key using SHA-256 (Web Crypto API)
 * Returns hex string
 */
export async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify API key against stored hash
 */
export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  const keyHash = await hashApiKey(key);
  return keyHash === hash;
}

/**
 * Get prefix for display (first 8 chars after 'ak_')
 * Returns 'ak_' + 8 chars = 11 chars total
 */
export function getApiKeyPrefix(key: string): string {
  return key.substring(0, 11);
}
