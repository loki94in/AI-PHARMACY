// AI Camera Service for OCR processing using Tesseract.js (offline capable)
import { createWorker } from 'tesseract.js';
class AICameraService {
    constructor() {
        this.worker = null;
        this.initialized = false;
    }
    async initialize() {
        if (this.initialized)
            return;
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
        }
        catch (error) {
            console.error('Failed to initialize AI Camera Service:', error);
            throw error;
        }
    }
    async processImage(imageData) {
        if (!this.initialized) {
            await this.initialize();
        }
        try {
            // Recognize text from image
            const { data } = await this.worker.recognize(imageData);
            // Process results into structured format (handle undefined data.words)
            const words = data.words ? data.words.map((word) => ({
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
        }
        catch (error) {
            console.error('Error processing image with Tesseract:', error);
            throw new Error(`OCR processing failed: ${error.message}`);
        }
    }
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            this.initialized = false;
        }
    }
}
// Export singleton instance
export const aiCameraService = new AICameraService();
