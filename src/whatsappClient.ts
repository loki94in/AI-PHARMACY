import { Client, LocalAuth } from 'whatsapp-web.js';

let clientInstance: Client | null = null;
let initializing = false;

/** Initialize the WhatsApp client and return it */
export async function initClient(): Promise<Client> {
  if (clientInstance) return clientInstance;
  if (initializing) {
    // wait for existing init to finish
    return new Promise<Client>((resolve, reject) => {
      const check = () => {
        if (clientInstance) resolve(clientInstance);
        else if (!initializing) reject(new Error('Initialization failed'));
        else setTimeout(check, 50);
      };
      check();
    });
  }
  initializing = true;
  return new Promise<Client>((resolve, reject) => {
    const client = new Client({ authStrategy: new LocalAuth() });
    client.on('qr', (qr: string) => {
      console.log('QR code:', qr);
    });
    client.on('ready', () => {
      clientInstance = client;
      initializing = false;
      resolve(client);
    });
    client.on('auth_failure', (msg: string) => {
      initializing = false;
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
  const options: any = {};
  if (mediaPath) options.media = mediaPath;
  if (caption) options.caption = caption;
  await clientInstance.sendMessage(to, options);
}
