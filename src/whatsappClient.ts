import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fs from 'fs';

// whatsapp-web.js uses CommonJS default export, so Client is a value not a type.
// Use InstanceType<typeof Client> to get the correct instance type.
type WAClient = InstanceType<typeof Client>;

let clientInstance: WAClient | null = null;
let initializing = false;

export let currentQr: string | null = null;
export let isReady: boolean = false;

let qrTimeout: NodeJS.Timeout | null = null;

/** Initialize the WhatsApp client and return it */
export async function initClient(): Promise<WAClient> {
  if (clientInstance) return clientInstance;
  if (initializing) {
    // wait for existing init to finish
    return new Promise<WAClient>((resolve, reject) => {
      const check = () => {
        if (clientInstance) resolve(clientInstance);
        else if (!initializing) reject(new Error('Initialization failed'));
        else setTimeout(check, 50);
      };
      check();
    });
  }
  initializing = true;
  return new Promise<WAClient>((resolve, reject) => {
    
    // Find local browser executable
    let execPath = '';
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of paths) {
      if (fs.existsSync(p)) {
        execPath = p;
        break;
      }
    }

    const client = new Client({ 
      authStrategy: new LocalAuth(),
      puppeteer: execPath ? { executablePath: execPath } : {}
    });

    client.on('qr', async (qr: string) => {
      console.log('WhatsApp QR code received');
      currentQr = qr;
      isReady = false;

      // Try sending QR via Telegram
      try {
        const qrcode = await import('qrcode');
        const buffer = await qrcode.default.toBuffer(qr);
        const { telegramBotService } = await import('./telegramBot.js');
        await telegramBotService.sendPhotoToDefaultChat(
          buffer, 
          '🚨 WhatsApp Action Required!\nPlease scan this new QR code within 30 seconds to reconnect.'
        );
      } catch (err) {
        console.error('Failed to send QR to telegram', err);
      }

      if (qrTimeout) clearTimeout(qrTimeout);
      
      // 30-second timeout to reload QR
      qrTimeout = setTimeout(() => {
        if (!isReady) {
          console.log('QR Code expired (30s). Destroying and reinitializing client...');
          client.destroy().then(() => {
            initializing = false;
            clientInstance = null;
            initClient();
          }).catch(console.error);
        }
      }, 30000);
    });

    client.on('ready', () => {
      console.log('WhatsApp Client is ready!');
      if (qrTimeout) clearTimeout(qrTimeout);
      clientInstance = client;
      initializing = false;
      isReady = true;
      currentQr = null;
      resolve(client);
    });

    client.on('disconnected', (reason) => {
      console.log('WhatsApp client disconnected:', reason);
      isReady = false;
      clientInstance = null;
      initializing = false;
      if (qrTimeout) clearTimeout(qrTimeout);
      client.destroy().then(() => {
        console.log('Re-initializing WhatsApp client after disconnect...');
        initClient();
      }).catch(console.error);
    });

    client.on('auth_failure', (msg: string) => {
      initializing = false;
      isReady = false;
      reject(new Error(msg));
    });
    
    client.initialize();
  });
}

/** Send a media message using the initialized client */
export async function sendMessage(to: string, mediaPath?: string, caption?: string): Promise<void> {
  if (!clientInstance) {
    throw new Error('Client not initialized. Call initClient() first.');
  }

  if (!to) {
    console.warn('Attempted to send WhatsApp message to an empty or null number. Skipping.');
    return;
  }

  // Global Phone Number Sanitizer
  let chatId = String(to);
  if (!chatId.includes('@')) {
    // Strip spaces, alphabets, plus signs, and any other special characters
    let cleanPhone = chatId.replace(/\D/g, '');
    
    // Automatically add India country code if it's exactly 10 digits
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }
    
    // Ensure the required WhatsApp suffix is added
    chatId = `${cleanPhone}@c.us`;
  }

  // whatsapp-web.js v1.22: sendMessage(chatId, content, options?)
  if (mediaPath) {
    const { MessageMedia } = await import('whatsapp-web.js');
    const media = MessageMedia.fromFilePath(mediaPath);
    await clientInstance.sendMessage(chatId, media, { caption: caption ?? '' });
  } else {
    await clientInstance.sendMessage(chatId, caption ?? '');
  }
}

