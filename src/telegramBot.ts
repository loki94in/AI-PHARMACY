import TelegramBot from 'node-telegram-bot-api';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMessage } from './i18n/getMessage';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

class TelegramBotService {
  private bot: TelegramBot | null = null;
  private readonly token: string | undefined;

  constructor() {
    this.token = process.env.TELEGRAM_BOT_TOKEN;
    this.lang = process.env.TELEGRAM_LANG || 'en';
    if (this.token) {
      this.initializeBot();
    }
  }

  private initializeBot(): void {
    this.bot = new TelegramBot(this.token, { polling: true });
    this.setupCommandHandlers();
    this.setupErrorHandling();

    console.log('Telegram bot initialized with polling');
  }

  private setupCommandHandlers(): void {
    if (!this.bot) return;

    // Handle /start command
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.bot?.sendMessage(chatId,
        'Welcome to AI Pharmacy Bot!\n\n' +
        'You can check medicine availability in two ways:\n' +
        '1. Use command: /check <medicine>\n' +
        '2. Just type the medicine name directly (e.g., paracetamol)\n\n' +
        'Other commands:\n' +
        '/help - Show this help message\n' +
        '/status - Check application status'
      );
    });

    // Handle /help command
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      this.bot?.sendMessage(chatId,
        'AI Pharmacy Bot Usage:\n\n' +
        '1. Direct medicine name: Send just the medicine name (e.g., paracetamol)\n' +
        '2. Command format: Use /check <medicine> (e.g., /check paracetamol)\n\n' +
        'Both methods will show:\n' +
        '• Availability status\n' +
        '• MRP (price per unit)\n' +
        '• Quantity in stock\n' +
        '• Alternative medicine (if out of stock)\n\n' +
        'Other commands:\n' +
        '/help - Show this help message\n' +
        '/status - Check application status'
      );
    });

    // Handle /check command for medicine availability
    this.bot.onText(/\/check (.+)/, async (msg, match) => {
      const chatId = msg.chat.id;
      const medicineName = match[1]?.toLowerCase().trim();

      if (!medicineName) {
        this.bot?.sendMessage(chatId, 'Please provide a medicine name to check. Example: /check paracetamol');
        return;
      }

      await this.handleMedicineQuery(chatId, medicineName);
    });

    // Handle /status command
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        const result = await db.get('SELECT COUNT(*) as total FROM medicines');
        await db.close();

        this.bot?.sendMessage(chatId,
          `🤖 AI Pharmacy Bot Status: Online\n` +
          `📊 Database: Connected (${result.total} medicines registered)\n` +
          `⏰ Uptime: Running since startup\n` +
          `🔄 Polling: Active`
        );
      } catch (error) {
        console.error('Error checking bot status:', error);
        this.bot?.sendMessage(chatId, '❌ Bot Status: Error connecting to database');
      }
    });

    // Handle direct medicine name messages (without / prefix)
    this.bot.on('message', (msg) => {
      const chatId = msg.chat.id;
      const messageText = msg.text?.trim();

      // Ignore empty messages
      if (!messageText) {
        return;
      }

      // If message starts with '/', treat as command (handled by onText handlers)
      if (messageText.startsWith('/')) {
        // Let the onText handlers process commands
        return;
      }

      // Treat direct messages as medicine name queries
      this.handleMedicineQuery(chatId, messageText);
    });
  }

  private setupErrorHandling(): void {
    if (!this.bot) return;

    this.bot.on('polling_error', (error) => {
      console.error('Telegram polling error:', error);
    });

    this.bot.on('error', (error) => {
      console.error('Telegram bot error:', error);
    });
  }

  // Method to send notifications to users
  public async sendNotification(chatId: string | number, message: string): Promise<boolean> {
    if (!this.bot) {
      console.error('Telegram bot not initialized');
      return false;
    }

    try {
      await this.bot.sendMessage(chatId, message);
      return true;
    } catch (error) {
      console.error('Failed to send Telegram notification:', error);
      return false;
    }
  }

  // Method to send notification to default chat (if configured)
  public async sendDefaultNotification(message: string): Promise<boolean> {
    const defaultChatId = process.env.TELEGRAM_CHAT_ID;
    if (defaultChatId) {
      return this.sendNotification(defaultChatId, message);
    }
    console.warn('TELEGRAM_CHAT_ID not configured for default notifications');
    return false;
  }

  // Method to broadcast message to multiple chats (if needed)
  public async broadcastMessage(chatIds: (string | number)[], message: string): Promise<number> {
    if (!this.bot) {
      console.error('Telegram bot not initialized');
      return 0;
    }

    let sentCount = 0;
    for (const chatId of chatIds) {
      try {
        await this.bot.sendMessage(chatId, message);
        sentCount++;
      } catch (error) {
        console.error(`Failed to send message to chat ${chatId}:`, error);
      }
    }
    return sentCount;
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    if (this.bot) {
      // Note: node-telegram-bot-api doesn't have a direct shutdown method for polling
      // The polling will stop when the process exits
      console.log('Telegram bot shutting down...');
      this.bot = null;
    }
  }
}

// Export singleton instance
export const telegramBotService = new TelegramBotService();
export default telegramBotService;