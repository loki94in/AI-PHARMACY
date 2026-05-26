import { Request, Response, NextFunction } from 'express';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

export async function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  // Bypass authentication in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  let expectedApiKey = process.env.API_KEY || 'Pass@123';
  
  if (!process.env.API_KEY) {
    console.warn('[WARNING] API_KEY environment variable is not set. Falling back to default "Pass@123".');
  }

  // Dynamically load login password from settings database if present
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    const row = await db.get("SELECT value FROM app_settings WHERE key = 'login_password'");
    await db.close();
    if (row && row.value) {
      expectedApiKey = row.value;
    }
  } catch (_) {
    // Fallback if DB table is not created yet
  }

  const apiKeyHeader = req.headers['x-api-key'] || req.query['api-key'] || req.query['apiKey'] || req.query['api_key'];

  if (!apiKeyHeader || apiKeyHeader !== expectedApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }

  next();
}
