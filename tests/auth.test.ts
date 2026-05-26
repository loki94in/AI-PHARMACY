import request from 'supertest';
import express from 'express';
import { authenticateApiKey } from '../src/middleware/auth.js';

describe('API Auth Middleware', () => {
  let app: express.Express;
  let originalNodeEnv: string | undefined;

  beforeAll(() => {
    originalNodeEnv = process.env.NODE_ENV;
    app = express();
    app.use(express.json());
    app.get('/test-api', authenticateApiKey, (req, res) => {
      res.json({ success: true });
    });
  });

  afterEach(() => {
    delete process.env.API_KEY;
    process.env.NODE_ENV = originalNodeEnv || 'test';
  });

  test('should bypass authentication when NODE_ENV is test', async () => {
    process.env.NODE_ENV = 'test';
    const res = await request(app).get('/test-api');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should block request without api key when NODE_ENV is not test', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'secure-key-abc';
    const res = await request(app).get('/test-api');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  test('should allow request with valid X-API-Key', async () => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'secure-key-abc';
    const res = await request(app)
      .get('/test-api')
      .set('x-api-key', 'secure-key-abc');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('should fallback to Pass@123 if API_KEY is not defined', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.API_KEY;
    const res = await request(app)
      .get('/test-api')
      .set('x-api-key', 'Pass@123');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
