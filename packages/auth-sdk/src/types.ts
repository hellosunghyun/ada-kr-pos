export interface AdakrposUser {
  id: string;
  email: string | null;         // Apple email (apple_email column)
  verifiedEmail: string | null; // pos.idserve.net verified email
  nickname: string | null;
  name: string | null;
  profilePhotoUrl: string | null;
  bio: string | null;
  contact: string | null;
  snsLinks: Record<string, string>;
  cohort: string | null;        // e.g. "2026"
  isVerified: boolean;          // true if pos.idserve.net email verified
  createdAt: number;            // Unix timestamp (milliseconds)
  updatedAt: number;            // Unix timestamp (milliseconds)
}

export interface AdakrposSession {
  id: string;
  userId: string;
  expiresAt: number;  // Unix timestamp (milliseconds)
  createdAt: number;  // Unix timestamp (milliseconds)
}

export interface AdakrposAuthContext {
  user: AdakrposUser;
  session: AdakrposSession;
  isAuthenticated: true;
}

export interface AdakrposUnauthContext {
  user: null;
  session: null;
  isAuthenticated: false;
}

export type AuthContext = AdakrposAuthContext | AdakrposUnauthContext;

export interface DeveloperApp {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  apiKeyPrefix: string;  // First 8 chars only (NEVER full key)
  redirectUrls: string[];
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ApiKeyInfo {
  appId: string;
  userId: string;
  prefix: string;
  isActive: boolean;
}
