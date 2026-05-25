// AI Camera Service for OCR processing using Tesseract.js (offline capable)
import { createWorker } from 'tesseract.js';

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
      // Create Tesseract worker with English language
      this.worker = await createWorker('eng');

      // Optional: Configure for better pharmacy product scanning
      await this.worker.setParameters({
        tessedit_pageseg_mode: 6, // Assume a single uniform block of text
        preserve_interword_spaces: '1',
      });

      this.initialized = true;
      console.log('AI Camera Service initialized with Tesseract.js');
    } catch (error) {
      console.error('Failed to initialize AI Camera Service:', error);
      throw error;
    }
  }

  async processImage(imageData: string | Buffer): Promise<OCRResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Recognize text from image
      const { data } = await this.worker.recognize(imageData);

      // Process results into structured format (handle undefined data.words)
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

      return {
        text: data.text || '',
        confidence: Math.round(data.confidence),
        words: words
      };
    } catch (error) {
      console.error('Error processing image with Tesseract:', error);
      throw new Error(`OCR processing failed: ${error.message}`);
    }
  }

  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.initialized = false;
    }
  }
}

// Export singleton instance
export const aiCameraService = new AICameraService();