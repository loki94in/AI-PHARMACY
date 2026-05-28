import { Worker } from 'worker_threads';
import path from 'path';
import { logger } from '../core/logger.js';

export class OcrWorkerFactory {
    public static runOcr(imagePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, '../workers/ocrWorker.js'), {
                workerData: { imagePath }
            });

            worker.on('message', resolve);
            worker.on('error', reject);
            worker.on('exit', (code) => {
                if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
            });
        });
    }
}
