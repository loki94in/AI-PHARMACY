import { logger, setupGlobalErrorHandler, initDb, runMigrations, TelegramService, WhatsAppService } from './core/index.js'; // This requires organizing exports

// Setup Error Handler
setupGlobalErrorHandler();

async function bootstrap() {
    try {
        // Init DB
        const db = await initDb();
        await runMigrations(db);

        // Init Services
        const telegram = new TelegramService(process.env.TELEGRAM_TOKEN || '');
        const whatsapp = new WhatsAppService();
        await whatsapp.initialize();

        logger.info('Application fully initialized');
    } catch (err) {
        logger.error('Failed to bootstrap application:', err);
        process.exit(1);
    }
}

bootstrap();
