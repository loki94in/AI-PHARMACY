import { startWorker, runModuleImport } from './catalogWorker.js';

console.log('[CatalogWorker Runner] Background catalog worker initialized.');

startWorker().catch((err) => {
  console.error('[CatalogWorker Runner] Fatal error during execution:', err);
  process.exit(1);
});

// IPC Heartbeat + job dispatch listener
process.on('message', (msg: any) => {
  if (msg && msg.type === 'PING') {
    process.send?.({ type: 'PONG' });
  }
  if (msg && msg.type === 'MODULE_IMPORT_JOB') {
    runModuleImport(msg.jobId, msg.moduleType).catch((err) => {
      console.error('[CatalogWorker Runner] MODULE_IMPORT_JOB failed:', err);
    });
  }
});

// Graceful exit if parent terminates or disconnects
process.on('disconnect', () => {
  console.log('[CatalogWorker Runner] Supervisor disconnected. Exiting...');
  process.exit(0);
});
