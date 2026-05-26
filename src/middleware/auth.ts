import { Request, Response, NextFunction } from 'express';

export function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  // Bypass authentication in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  const expectedApiKey = process.env.API_KEY || 'dev-key-123';
  
  if (!process.env.API_KEY) {
    console.warn('[WARNING] API_KEY environment variable is not set. Falling back to default "dev-key-123".');
  }

  const apiKeyHeader = req.headers['x-api-key'];

  if (!apiKeyHeader || apiKeyHeader !== expectedApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }

  next();
}
