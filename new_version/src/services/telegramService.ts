import TelegramBot from 'node-telegram-bot-api';
import { logger } from '../core/logger.js';

export class TelegramService {
    private bot: TelegramBot;

    constructor(token: string) {
        if (!token) {
            throw new Error('Telegram bot token is required');
        }
        this.bot = new TelegramBot(token, { polling: true });
        this.setupListeners();
        logger.info('Telegram service initialized');
    }

    private setupListeners() {
        this.bot.on('error', (err) => logger.error('Telegram Bot Error:', err));
        this.bot.on('polling_error', (err) => logger.error('Telegram Polling Error:', err));
        
        this.bot.on('message', (msg) => {
            logger.info(`Message received: ${msg.text}`);
        });
    }

    public sendMessage(chatId: number, text: string) {
        return this.bot.sendMessage(chatId, text);
    }
}
