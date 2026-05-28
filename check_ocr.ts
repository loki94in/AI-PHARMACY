import { paddleOcrService } from './src/services/paddleOcrService';
import path from 'path';

async function runTest() {
  console.log('Checking PaddleOCR availability...');
  const isAvailable = await paddleOcrService.checkAvailability();
  console.log('Is OCR available:', isAvailable);

  if (isAvailable) {
    const imagePath = path.resolve('uploads', 'WhatsApp Image 2026-05-25 at 15.50.33.jpeg');
    console.log('Scanning image:', imagePath);
    const result = await paddleOcrService.scanImage(imagePath);
    console.log('OCR Result:', JSON.stringify(result, null, 2));
  } else {
    console.log('PaddleOCR not available. Ensure PYTHON_PATH is set correctly.');
  }
}

runTest().catch(console.error);
