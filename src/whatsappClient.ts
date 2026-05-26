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
    client.on('qr', (qr: string) => {
      console.log('WhatsApp QR code received');
      currentQr = qr;
      isReady = false;
    });
    client.on('ready', () => {
      console.log('WhatsApp Client is ready!');
      clientInstance = client;
      initializing = false;
      isReady = true;
      currentQr = null;
      resolve(client);
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
  // whatsapp-web.js v1.22: sendMessage(chatId, content, options?)
  // For text-only: pass the string directly as content
  // For media: create MessageMedia and pass as content
  if (mediaPath) {
    const { MessageMedia } = await import('whatsapp-web.js');
    const media = MessageMedia.fromFilePath(mediaPath);
    await clientInstance.sendMessage(to, media, { caption: caption ?? '' });
  } else {
    await clientInstance.sendMessage(to, caption ?? '');
  }
}

