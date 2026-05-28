import { logger } from './logger.js';

export const setupGlobalErrorHandler = () => {
    process.on('uncaughtException', (err) => {
        logger.error('FATAL: Uncaught Exception:', err);
        // Initiate graceful shutdown
        process.exit(1); 
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('FATAL: Unhandled Rejection at:', promise, 'reason:', reason);
    });
};
