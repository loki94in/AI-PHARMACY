import { startOcrWorker } from './ocrWorker.js';

console.log('[OCR Worker Runner] Background OCR worker initializing...');

startOcrWorker().catch((err) => {
  console.error('[OCR Worker Runner] Fatal error:', err);
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
  console.log('[OCR Worker Runner] Supervisor disconnected. Exiting...');
  process.exit(0);
});
