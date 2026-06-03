import { Request, Response, NextFunction } from 'express';
import { dbManager } from '../database/connection.js';
import { config } from '../config/index.js';

async function getSessionToken(): Promise<string | null> {
  try {
    const db = await dbManager.getConnection();
    const row = await db.get<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = 'license_session_token'"
    );
    return row?.value || null;
  } catch {
    return null;
  }
}

export async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  // Skip auth in development and test environments
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // License routes are always open (needed for activation)
  if (req.path.startsWith('/api/license')) {
    return next();
  }

  // In production: validate against the session token issued at license activation.
  const provided =
    req.headers['x-session-token'] ||
    req.headers['x-api-key'] ||
    req.query['api-key'] ||
    req.query['apiKey'];

  if (!provided) {
    return res.status(401).json({ error: 'Unauthorized: Missing session token.' });
  }

  const expected = await getSessionToken();

  // Fall back to legacy API key for backwards compatibility during migration
  const legacyKey = config.apiKey;

  if (provided !== expected && provided !== legacyKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid session token.' });
  }

  next();
}