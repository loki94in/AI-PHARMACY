import { startWhatsappWorker } from './whatsappWorker.js';

console.log('[WhatsApp Worker Runner] Background WhatsApp worker initializing...');

startWhatsappWorker().catch((err) => {
  console.error('[WhatsApp Worker Runner] Fatal error:', err);
  process.exit(1);
});

// IPC Heartbeat listener
process.on('message', (msg: any) => {
  if (msg && msg.type === 'PING') {
    process.send?.({ type: 'PONG' });
  }
});

// Graceful exit if parent disconnects
process.on('disconnect', () => {
  console.log('[WhatsApp Worker Runner] Supervisor disconnected. Exiting...');
  process.exit(0);
});
