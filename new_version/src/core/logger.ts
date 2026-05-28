import winston from 'winston';
import path from 'path';

// Store logs in %APPDATA%/ai-pharmacy/logs
const logDir = process.env.APPDATA 
    ? path.join(process.env.APPDATA, 'ai-pharmacy', 'logs') 
    : path.join(process.cwd(), 'logs');

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
    new winston.transports.Console({ format: winston.format.simple() })
  ],
});
