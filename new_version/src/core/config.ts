import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from project root or APPDATA
dotenv.config();

export const config = {
    dbPath: process.env.APPDATA 
        ? path.join(process.env.APPDATA, 'ai-pharmacy', 'data', 'database.sqlite')
        : path.join(process.cwd(), 'data', 'database.sqlite'),
    port: process.env.PORT || 3000
};

// Ensure directories exist
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)){
    fs.mkdirSync(dbDir, { recursive: true });
}
