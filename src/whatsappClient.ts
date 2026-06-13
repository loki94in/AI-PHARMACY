import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fs from 'fs';
import { eventService } from './services/eventService.js';

// whatsapp-web.js uses CommonJS default export, so Client is a value not a type.
// Use InstanceType<typeof Client> to get the correct instance type.
type WAClient = InstanceType<typeof Client>;

let clientInstance: WAClient | null = null;
let activeClient: WAClient | null = null; // Track currently initializing or active client
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
    activeClient = client;

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
          console.log('QR Code expired (30s). Destroying client to prevent leak. Standing by.');
          client.destroy().catch(err => console.error('Error destroying WA client:', err));
        }
      }, 30000);
    });

    client.on('ready', () => {
      console.log('WhatsApp Client is ready!');
      if (qrTimeout) clearTimeout(qrTimeout);
      clientInstance = client;
      activeClient = client;
      initializing = false;
      isReady = true;
      currentQr = null;
      resolve(client);
    });

    client.on('disconnected', (reason) => {
      console.log('WhatsApp client disconnected:', reason);
      isReady = false;
      clientInstance = null;
      activeClient = null;
      initializing = false;
      if (qrTimeout) clearTimeout(qrTimeout);
      
      eventService.broadcast('auth_failure', {
        message: 'WhatsApp Web disconnected. Please scan the QR code in Settings to reconnect.',
        service: 'whatsapp'
      });

      // Gracefully destroy, then wait for explicit reconnect to avoid detached frame errors
      client.destroy().catch(() => {}).finally(() => {
        console.log('WhatsApp client destroyed. Waiting for manual or API-triggered reconnect.');
      });
    });

    client.on('auth_failure', (msg: string) => {
      initializing = false;
      isReady = false;
      activeClient = null;
      
      eventService.broadcast('auth_failure', {
        message: `WhatsApp authentication failed: ${msg}. Please reconnect in Settings.`,
        service: 'whatsapp'
      });

      reject(new Error(msg));
    });
    
    client.initialize();
  });
}

/** Send a media message using the initialized client */
export async function sendMessage(
  to: string,
  mediaPath?: string,
  caption?: string,
  file?: { mimetype: string; data: string; filename?: string }
): Promise<void> {
  if (!clientInstance) {
    throw new Error('Client not initialized. Call initClient() first.');
  }

  if (!to) {
    console.warn('Attempted to send WhatsApp message to an empty or null number. Skipping.');
    return;
  }

  const recipients = String(to)
    .split(/[,;\s]+/)
    .map(r => r.trim())
    .filter(r => r.length > 0);

  for (const recipient of recipients) {
    let chatId = recipient;
    if (!chatId.includes('@')) {
      let cleanPhone = chatId.replace(/\D/g, '');
      if (cleanPhone.length === 10) {
        cleanPhone = `91${cleanPhone}`;
      }
      chatId = `${cleanPhone}@c.us`;
    }

    try {
      if (file && file.mimetype && file.data) {
        const { MessageMedia } = await import('whatsapp-web.js');
        const media = new MessageMedia(file.mimetype, file.data, file.filename || 'file');
        await clientInstance.sendMessage(chatId, media, { caption: caption ?? '' });
      } else if (mediaPath) {
        const { MessageMedia } = await import('whatsapp-web.js');
        const media = MessageMedia.fromFilePath(mediaPath);
        await clientInstance.sendMessage(chatId, media, { caption: caption ?? '' });
      } else {
        await clientInstance.sendMessage(chatId, caption ?? '');
      }
    } catch (err) {
      console.error(`Failed to send WhatsApp message to ${chatId}:`, err);
    }
  }
}

/** Get all chats from the initialized client */
export async function getChats(): Promise<any[]> {
  if (!clientInstance) {
    throw new Error('Client not initialized. Call initClient() first.');
  }
  return await clientInstance.getChats();
}

/** Get messages for a specific chat */
export async function getChatMessages(chatId: string, limit: number = 50): Promise<any[]> {
  if (!clientInstance) {
    throw new Error('Client not initialized. Call initClient() first.');
  }
  
  // Format the phone number properly
  let cleanId = String(chatId);
  if (!cleanId.includes('@')) {
    let cleanPhone = cleanId.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    cleanId = `${cleanPhone}@c.us`;
  }

  const chat = await clientInstance.getChatById(cleanId);
  if (!chat) return [];
  
  return await chat.fetchMessages({ limit });
}

/** Destroy the WhatsApp client to release file locks on the session folder */
export async function destroyClient(): Promise<void> {
  console.log('[WhatsApp] Destroying client to release session locks...');
  isReady = false;
  currentQr = null;
  initializing = false;
  if (qrTimeout) {
    clearTimeout(qrTimeout);
    qrTimeout = null;
  }
  if (activeClient) {
    try {
      // Race destroy promise with a 5-second timeout to prevent indefinite hangs
      await Promise.race([
        activeClient.destroy(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('client.destroy() timed out')), 5000))
      ]);
    } catch (err) {
      console.error('[WhatsApp] Error destroying client:', err);
    }
    activeClient = null;
  }
  clientInstance = null;
}

/** Force reconnect, clear saved session, and reinitialize for a fresh QR code */
export async function forceReconnect(): Promise<void> {
  console.log('[WhatsApp] Force reconnect requested. Destroying client and clearing session...');
  
  // 1. Reset state immediately
  isReady = false;
  currentQr = null;
  initializing = false;
  if (qrTimeout) clearTimeout(qrTimeout);
  
  // 2. Destroy the existing client if any
  if (activeClient) {
    try {
      // Race destroy promise with a 5-second timeout to prevent indefinite hangs
      await Promise.race([
        activeClient.destroy(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('client.destroy() timed out')), 5000))
      ]);
    } catch (err) {
      console.error('[WhatsApp] Error destroying client (non-fatal):', err);
    }
    activeClient = null;
  }
  clientInstance = null;

  // 3. Delete the stored auth session so a fresh QR is required
  const authPath = '.wwebjs_auth';
  try {
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log('[WhatsApp] Old session data cleared from', authPath);
    }
  } catch (err) {
    console.error('[WhatsApp] Failed to clear session folder (non-fatal):', err);
  }

  // 4. Wait a moment then reinitialize — a fresh QR will be emitted
  await new Promise(r => setTimeout(r, 2000));
  initClient().catch(err => {
    console.error('[WhatsApp] Re-initialization after reconnect failed (non-fatal):', err.message);
  });
}

/** Download media for a specific message */
export async function getMessageMedia(chatId: string, messageId: string): Promise<{ mimetype: string; data: string; filename?: string }> {
  if (!clientInstance) {
    throw new Error('WhatsApp client not initialized.');
  }

  let cleanId = String(chatId);
  if (!cleanId.includes('@')) {
    let cleanPhone = cleanId.replace(/\D/g, '');
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;
    cleanId = `${cleanPhone}@c.us`;
  }

  const chat = await clientInstance.getChatById(cleanId);
  if (!chat) {
    throw new Error('Chat not found.');
  }

  // Fetch recent messages to locate the target message
  const messages = await chat.fetchMessages({ limit: 100 });
  const message = messages.find(m => m.id._serialized === messageId);
  
  if (!message) {
    throw new Error('Message not found.');
  }
  if (!message.hasMedia) {
    throw new Error('Message does not contain media.');
  }

  const media = await message.downloadMedia();
  if (!media) {
    throw new Error('Failed to download message media.');
  }

  return {
    mimetype: media.mimetype,
    data: media.data, // base64 string
    filename: media.filename || undefined
  };
}
