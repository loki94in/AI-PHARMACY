import { Client, LocalAuth } from 'whatsapp-web.js';
import { logger } from '../core/logger.js';
import path from 'path';
import { getAppDataPath } from '../utils/pathUtils.js';

export class WhatsAppService {
    private client: Client;

    constructor() {
        this.client = new Client({
            authStrategy: new LocalAuth({
                dataPath: getAppDataPath('whatsapp-session')
            }),
            puppeteer: {
                args: ['--no-sandbox']
            }
        });

        this.setupListeners();
    }

    private setupListeners() {
        this.client.on('qr', (qr) => {
            logger.info('WhatsApp QR received, scan it!');
        });

        this.client.on('ready', () => {
            logger.info('WhatsApp Client is ready!');
        });

        this.client.on('message', async (msg) => {
            logger.info(`WhatsApp Message: ${msg.body}`);
        });
    }

    public async initialize() {
        await this.client.initialize();
    }
}
