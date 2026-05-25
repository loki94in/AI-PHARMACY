import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fs from 'fs';
let clientInstance = null;
let initializing = false;
export let currentQr = null;
export let isReady = false;
/** Initialize the WhatsApp client and return it */
export async function initClient() {
    if (clientInstance)
        return clientInstance;
    if (initializing) {
        // wait for existing init to finish
        return new Promise((resolve, reject) => {
            const check = () => {
                if (clientInstance)
                    resolve(clientInstance);
                else if (!initializing)
                    reject(new Error('Initialization failed'));
                else
                    setTimeout(check, 50);
            };
            check();
        });
    }
    initializing = true;
    return new Promise((resolve, reject) => {
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
        client.on('qr', (qr) => {
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
        client.on('auth_failure', (msg) => {
            initializing = false;
            isReady = false;
            reject(new Error(msg));
        });
        client.initialize();
    });
}
/** Send a media message using the initialized client */
export async function sendMessage(to, mediaPath, caption) {
    if (!clientInstance) {
        throw new Error('Client not initialized. Call initClient() first.');
    }
    const options = {};
    if (mediaPath)
        options.media = mediaPath;
    if (caption)
        options.caption = caption;
    await clientInstance.sendMessage(to, options);
}
