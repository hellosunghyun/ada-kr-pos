export interface AdaposUser {
  id: string;
  email: string | null;         // Apple email (apple_email column)
  verifiedEmail: string | null; // pos.idserve.net verified email
  nickname: string | null;
  name: string | null;
  profilePhotoUrl: string | null;
  bio: string | null;
  contact: string | null;
  snsLinks: Record<string, string>;
  isVerified: boolean;          // true if pos.idserve.net email verified
  createdAt: number;            // Unix timestamp (milliseconds)
  updatedAt: number;            // Unix timestamp (milliseconds)
}

export interface AdaposSession {
  id: string;
  userId: string;
  expiresAt: number;  // Unix timestamp (milliseconds)
  createdAt: number;  // Unix timestamp (milliseconds)
}

export interface AdaposAuthContext {
  user: AdaposUser;
  session: AdaposSession;
  isAuthenticated: true;
}

export interface AdaposUnauthContext {
  user: null;
  session: null;
  isAuthenticated: false;
}

export type AuthContext = AdaposAuthContext | AdaposUnauthContext;

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
