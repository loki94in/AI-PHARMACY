import { createWorker } from 'tesseract.js';
import { paddleOcrService } from './src/services/paddleOcrService.js';
import fs from 'fs';
import path from 'path';

// Function to test Tesseract.js with the same parameters as in AI Camera service
async function testTesseract(imagePath) {
  console.log('  Testing with Tesseract.js (using AI Camera service config)...');
  const startTime = Date.now();
  try {
    const worker = await createWorker('eng', 1, {
      langPath: process.cwd(), // Load local eng.traineddata from root folder
      gzip: false,             // Use uncompressed local traineddata file
    });
    await worker.setParameters({
      tessedit_pageseg_mode: 6, // Assume a single uniform block of text
      preserve_interword_spaces: '1',
      tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-/ mgμ%', // Expected medicine label chars
      user_defined_dictionary: './data/medicine_dict.txt', // Custom medicine dictionary
      user_patterns_file: './data/medicine_patterns.txt',  // Patterns like "\\d+mg", "\\d+ tablet"
    });
    const { data } = await worker.recognize(imagePath);
    await worker.terminate();
    const endTime = Date.now();

    // Process the Tesseract.js result to match the format we expect
    const words = data.words ? data.words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: {
        x0: word.bbox.x0,
        y0: word.bbox.y0,
        x1: word.bbox.x1,
        y1: word.bbox.y1
      }
    })) : [];

    const confidence = Math.round(data.confidence);

    console.log(`    Processing time: ${endTime - startTime}ms`);
    console.log(`    Extracted text: "${data.text}"`);
    console.log(`    Confidence: ${confidence}%`);
    console.log(`    Words found: ${words.length}`);
    return { text: data.text, confidence, words };
  } catch (error) {
    console.error(`    Error in Tesseract.js: ${error.message}`);
    return { text: '', confidence: 0, words: [], error: error.message };
  }
}

// Function to test PaddleOCR
async function testPaddleOCR(imagePath) {
  console.log('  Testing with PaddleOCR...');
  const startTime = Date.now();
  try {
    const result = await paddleOcrService.scanImage(imagePath);
    const endTime = Date.now();

    console.log(`    Processing time: ${endTime - startTime}ms`);
    console.log(`    Success: ${result.success}`);
    if (result.success) {
      console.log(`    Extracted text: "${result.text}"`);
      console.log(`    Words found: ${result.words?.length || 0}`);
      console.log(`    Average confidence: ${result.confidence || 0}%`);
    } else {
      console.log(`    Error: ${result.error}`);
    }
    return result;
  } catch (error) {
    console.error(`    Error in PaddleOCR: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Function to get the original OCR text from the audit queue for an image
function getOriginalOCRTextFromAuditQueue(filename) {
  const auditQueuePath = path.resolve(process.cwd(), 'data', 'audit_queue.json');
  if (!fs.existsSync(auditQueuePath)) {
    return null;
  }
  try {
    const queueData = fs.readFileSync(auditQueuePath, 'utf8');
    const queue = JSON.parse(queueData);
    // Find the entry that matches the filename (the imagePath in the queue entry ends with the filename)
    const entry = queue.find(item => item.imagePath && item.imagePath.endsWith(filename));
    if (entry) {
      return {
        text: entry.rawOcrText || '',
        confidence: entry.confidence || null
      };
    }
  } catch (e) {
    console.error('Error reading audit queue:', e.message);
  }
  return null;
}

async function main() {
  console.log('=== OCR Engine Test on Audit Images ===\n');

  // Check if audit images directory exists
  const auditImagesDir = path.resolve(process.cwd(), 'data', 'audit_images');
  if (!fs.existsSync(auditImagesDir)) {
    console.log('ERROR: Audit images directory not found');
    return;
  }

  // Get list of image files (limit to first 3 for testing)
  const files = fs.readdirSync(auditImagesDir)
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.bmp', '.tiff'].includes(ext);
    })
    .slice(0, 3);

  if (files.length === 0) {
    console.log('ERROR: No image files found in audit images directory');
    return;
  }

  console.log(`Found ${files.length} images to test\n`);

  // Check PaddleOCR availability
  console.log('1. Checking PaddleOCR availability...');
  const availabilityStart = Date.now();
  const isPaddleAvailable = await paddleOcrService.checkAvailability();
  const availabilityTime = Date.now() - availabilityStart;
  console.log(`   Available: ${isPaddleAvailable}`);
  console.log(`   Check time: ${availabilityTime}ms\n`);

  // Test each image
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const imagePath = path.resolve(auditImagesDir, filename);

    console.log(`${i+1}. Testing: ${filename}`);

    // Get original OCR text from audit queue (if available)
    const originalOCR = getOriginalOCRTextFromAuditQueue(filename);
    if (originalOCR) {
      console.log(`   Original OCR from audit queue:`);
      console.log(`     Text: "${originalOCR.text}"`);
      if (originalOCR.confidence !== null) {
        console.log(`     Confidence: ${originalOCR.confidence}%`);
      }
    } else {
      console.log(`   Original OCR: Not found in audit queue`);
    }

    // Test Tesseract.js
    await testTesseract(imagePath);
    console.log(''); // blank line

    // Test PaddleOCR if available
    if (isPaddleAvailable) {
      await testPaddleOCR(imagePath);
      console.log(''); // blank line
    } else {
      console.log('  Skipping PaddleOCR test (not available)\n');
    }
  }

  console.log('=== Test Complete ===');
}

// Run the test
main().catch(console.error);