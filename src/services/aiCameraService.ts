// AI Camera Service for OCR processing using Tesseract.js (offline capable)
import { createWorker } from 'tesseract.js';
import { productNameFilterService } from './productNameFilterService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface OCRResult {
  text: string;
  confidence: number;
  words: Array<{
    text: string;
    confidence: number;
    bbox: {
      x0: number;
      y0: number;
      x1: number;
      y1: number;
    };
  }>;
}

class AICameraService {
  private worker: any = null;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.worker = await createWorker('eng', 1, {
        langPath: process.cwd(), // Load local eng.traineddata from root folder
        gzip: false             // Use uncompressed local traineddata file
      });
      await this.worker.setParameters({
        tessedit_pageseg_mode: 6, // Assume a single uniform block of text
        preserve_interword_spaces: '1',
      });
      this.initialized = true;
      console.log('AI Camera Service initialized with local Tesseract.js config');
    } catch (error) {
      console.error('Failed to initialize AI Camera Service:', error);
      throw error;
    }
  }

  async processImage(imageData: string | Buffer): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    let localOcrResult: OCRResult = { text: '', confidence: 0, words: [] };

    try {
      // 1. Run local Tesseract OCR
      const { data } = await this.worker.recognize(imageData);
      const words = data.words ? data.words.map((word: any) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: {
          x0: word.bbox.x0,
          y0: word.bbox.y0,
          x1: word.bbox.x1,
          y1: word.bbox.y1,
        }
      })) : [];

      localOcrResult = {
        text: data.text || '',
        confidence: Math.round(data.confidence),
        words: words
      };
    } catch (ocrError: any) {
      console.error('Local Tesseract OCR failed:', ocrError);
    }

    // Check matches in local database using fuzzy matching
    let matches: string[] = [];
    try {
      const filterResult = await productNameFilterService.filterProductNames(localOcrResult.text, {
        minConfidenceThreshold: 0.7
      });
      matches = filterResult.matches;
    } catch (e) {
      try {
        await productNameFilterService.initialize();
        const filterResult = await productNameFilterService.filterProductNames(localOcrResult.text, {
          minConfidenceThreshold: 0.7
        });
        matches = filterResult.matches;
      } catch (err: any) {
        console.error('Filter service query/init failed:', err);
      }
    }

    // 3. Save unrecognized images for pharmacist audit
    // An image is unrecognized if it doesn't match any medicine in our database (matches is empty)
    if (matches.length === 0) {
      try {
        await this.saveToAuditQueue(imageData, localOcrResult.text, null);
      } catch (auditError) {
        console.error('Failed to log to audit queue:', auditError);
      }
    }

    // Construct final medicineInfo structure for the routes
    const finalInfo: any = {};
    // Use OCR extraction matching
    const lines = localOcrResult.text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    finalInfo.potentialName = matches.length > 0 ? matches[0] : (lines.length > 0 ? lines[0] : '');

    const strengthMatch = localOcrResult.text.match(/\d+\s*(?:mg|g|ml|μg|iu)/i);
    if (strengthMatch) finalInfo.strength = strengthMatch[0];

    const batchMatch = localOcrResult.text.match(/(?:batch|lot|#)\s*[:\-]?\s*([A-Z0-9]+)/i);
    if (batchMatch) finalInfo.batchNumber = batchMatch[1];

    const expiryMatch = localOcrResult.text.match(/(?:exp|expiry)\s*[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{2})/i);
    if (expiryMatch) finalInfo.expiryDate = expiryMatch[1];

    const priceMatch = localOcrResult.text.match(/(?:mrp|price|₹|rs)\s*[:\-]?\s*(\d+(?:\.\d{2})?)/i);
    if (priceMatch) finalInfo.mrp = parseFloat(priceMatch[1]);

    return {
      text: localOcrResult.text,
      confidence: localOcrResult.confidence,
      words: localOcrResult.words,
      medicineInfo: finalInfo,
      matches,
      fallbackUsed: false,
      auditLogged: matches.length === 0
    };
  }

  private async saveToAuditQueue(imageData: string | Buffer, rawOcrText: string, cloudResult: any): Promise<void> {
    const timestamp = Date.now();
    const id = `audit_${timestamp}`;
    const filename = `${id}.jpg`;

    const rootDir = process.cwd();
    const auditImagesDir = path.resolve(rootDir, 'data', 'audit_images');
    const auditQueuePath = path.resolve(rootDir, 'data', 'audit_queue.json');
    const imagePath = path.join('data', 'audit_images', filename);
    const absoluteImagePath = path.join(auditImagesDir, filename);

    if (!fs.existsSync(auditImagesDir)) {
      fs.mkdirSync(auditImagesDir, { recursive: true });
    }

    let buffer: Buffer;
    if (typeof imageData === 'string') {
      if (imageData.startsWith('data:')) {
        const base64Data = imageData.split(',')[1];
        buffer = Buffer.from(base64Data, 'base64');
      } else {
        buffer = Buffer.from(imageData, 'base64');
      }
    } else {
      buffer = imageData;
    }

    await fs.promises.writeFile(absoluteImagePath, buffer);

    let queue: any[] = [];
    if (fs.existsSync(auditQueuePath)) {
      try {
        const data = await fs.promises.readFile(auditQueuePath, 'utf8');
        queue = JSON.parse(data || '[]');
      } catch (e) {
        console.error('Failed to read audit queue json:', e);
        queue = [];
      }
    }

    const newEntry = {
      id,
      imagePath,
      rawOcrText,
      cloudSuggestedText: cloudResult ? JSON.stringify(cloudResult) : '',
      cloudDetails: cloudResult || null,
      status: 'pending_human_review',
      createdAt: new Date().toISOString()
    };

    queue.push(newEntry);
    await fs.promises.writeFile(auditQueuePath, JSON.stringify(queue, null, 2));
    console.log(`Added unrecognized scan to audit queue: ${id}`);
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}

export const aiCameraService = new AICameraService();
export default aiCameraService;