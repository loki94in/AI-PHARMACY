import { Request, Response, NextFunction } from 'express';
import { Database } from 'sqlite';
import { dbManager } from '../database/connection.js';
import { config } from '../config/index.js';

export async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  // Bypass authentication in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  let expectedApiKey = config.apiKey;

  if (!process.env.API_KEY) {
    console.warn('[WARNING] API_KEY environment variable is not set. Falling back to default "Pass@123".');
  }

  // Dynamically load login password from settings database if present
  try {
    const db = await dbManager.getConnection();
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'login_password'");
    await dbManager.close(); // Close after getting the setting
    if (row && row.value) {
      expectedApiKey = row.value;
    }
  } catch (_) {
    // Fallback if DB table is not created yet
    await dbManager.close();
  }

  const apiKeyHeader = req.headers['x-api-key'] || req.query['api-key'] || req.query['apiKey'] || req.query['api_key'];

  if (!apiKeyHeader || apiKeyHeader !== expectedApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }

  next();
}