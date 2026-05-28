import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { getAppDataPath } from '../utils/pathUtils.js';
import path from 'path';
import fs from 'fs';
import { logger } from '../core/logger.js';

export const initDb = async () => {
    const dbDir = getAppDataPath('data');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    
    const dbPath = path.join(dbDir, 'database.sqlite');
    
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    logger.info(`Database initialized at ${dbPath}`);
    return db;
};
