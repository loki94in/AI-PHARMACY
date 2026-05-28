import { initDb, runMigrations } from './src/database/db';
import { logger } from './src/core/logger';

async function verifyDatabase() {
    try {
        logger.info('Verifying database initialization...');
        const db = await initDb();
        await runMigrations(db);
        logger.info('Database and migrations verified successfully.');
        process.exit(0);
    } catch (err) {
        logger.error('Database verification failed:', err);
        process.exit(1);
    }
}

verifyDatabase();
