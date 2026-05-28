const { initDb, runMigrations } = require('./dist/database/db'); // Path to compiled DB logic
const { logger } = require('./dist/core/logger');

async function verifyDatabase() {
    try {
        console.log('Verifying database initialization...');
        const db = await initDb();
        await runMigrations(db);
        console.log('Database and migrations verified successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Database verification failed:', err);
        process.exit(1);
    }
}

verifyDatabase();
