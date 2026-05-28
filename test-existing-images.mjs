import { paddleOcrService } from './src/services/paddleOcrService.js';
import { aiCameraService } from './src/services/aiCameraService.js';
import fs from 'fs';
import path from 'path';

async function testExistingImages() {
  console.log('=== Testing OCR on Existing Audit Images ===\n');

  // Check if audit images directory exists
  const auditImagesDir = path.resolve(process.cwd(), 'data', 'audit_images');
  if (!fs.existsSync(auditImagesDir)) {
    console.log('Audit images directory not found');
    return;
  }

  // Get list of image files
  const files = fs.readdirSync(auditImagesDir)
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.bmp', '.tiff'].includes(ext);
    })
    .slice(0, 3); // Test first 3 images

  if (files.length === 0) {
    console.log('No image files found in audit images directory');
    return;
  }

  console.log(`Found ${files.length} images to test\n`);

  // Check PaddleOCR availability
  console.log('1. Checking PaddleOCR availability...');
  const availabilityStart = Date.now();
  const isAvailable = await paddleOcrService.checkAvailability();
  const availabilityTime = Date.now() - availabilityStart;

  console.log(`   Available: ${isAvailable}`);
  console.log(`   Check time: ${availabilityTime}ms\n`);

  // Test each image
  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const imagePath = path.resolve(auditImagesDir, filename);

    console.log(`${i+1}. Testing: ${filename}`);

    // Check corresponding audit queue entry for raw OCR text
    const auditQueuePath = path.resolve(process.cwd(), 'data', 'audit_queue.json');
    let originalText = 'Not found in audit queue';
    let originalConfidence = null;
    try {
      if (fs.existsSync(auditQueuePath)) {
        const queueData = fs.readFileSync(auditQueuePath, 'utf8');
        const queue = JSON.parse(queueData);
        const entry = queue.find(item => item.imagePath && item.imagePath.includes(filename));
        if (entry) {
          originalText = entry.rawOcrText || 'No OCR text';
          originalConfidence = entry.confidence || null;
        }
      }
    } catch (e) {
      // Ignore errors reading audit queue
    }

    console.log(`   Original OCR text: "${originalText}"${originalConfidence !== null ? ` (confidence: ${originalConfidence}%)` : ''}`);

    if (!isAvailable) {
      // Test with Tesseract.js via AI Camera Service
      console.log('   Testing with Tesseract.js (PaddleOCR unavailable)...');
      const cameraStart = Date.now();
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        const cameraResult = await aiCameraService.processImage(imageBuffer);
        const cameraTime = Date.now() - cameraStart;

        console.log(`      Processing time: ${cameraTime}ms`);
        console.log(`      Fallback used: ${cameraResult.fallbackUsed}`);
        console.log(`      Extracted text: "${cameraResult.text}"`);
        console.log(`      Confidence: ${cameraResult.confidence}%`);
        console.log(`      Words found: ${cameraResult.words.length}`);
        console.log(`      Medicine matches: ${cameraResult.matches.length}`);
        if (cameraResult.matches.length > 0) {
          console.log(`      Top matches: ${cameraResult.matches.slice(0, 3).join(', ')}`);
        }
        console.log(`      Medicine info: ${JSON.stringify(cameraResult.medicineInfo)}`);
        console.log(`      Audit logged: ${cameraResult.auditLogged}`);
      } catch (error) {
        console.log(`      Error: ${error.message}`);
      }
    } else {
      // Test with PaddleOCR directly
      console.log('   Testing with PaddleOCR...');
      const paddleStart = Date.now();
      try {
        const paddleResult = await paddleOcrService.scanImage(imagePath);
        const paddleTime = Date.now() - paddleStart;

        console.log(`      Processing time: ${paddleTime}ms`);
        console.log(`      Success: ${paddleResult.success}`);
        if (paddleResult.success) {
          console.log(`      Extracted text: "${paddleResult.text}"`);
          console.log(`      Words found: ${paddleResult.words?.length || 0}`);
          console.log(`      Average confidence: ${paddleResult.confidence || 0}%`);
        } else {
          console.log(`      Error: ${paddleResult.error}`);
        }
      } catch (error) {
        console.log(`      Error: ${error.message}`);
      }

      // Also test with AI Camera Service
      console.log('   Testing with AI Camera Service...');
      const cameraStart = Date.now();
      try {
        const imageBuffer = fs.readFileSync(imagePath);
        const cameraResult = await aiCameraService.processImage(imageBuffer);
        const cameraTime = Date.now() - cameraStart;

        console.log(`      Processing time: ${cameraTime}ms`);
        console.log(`      Fallback used: ${cameraResult.fallbackUsed}`);
        console.log(`      Extracted text: "${cameraResult.text}"`);
        console.log(`      Confidence: ${cameraResult.confidence}%`);
        console.log(`      Words found: ${cameraResult.words.length}`);
        console.log(`      Medicine matches: ${cameraResult.matches.length}`);
        if (cameraResult.matches.length > 0) {
          console.log(`      Top matches: ${cameraResult.matches.slice(0, 3).join(', ')}`);
        }
        console.log(`      Medicine info: ${JSON.stringify(cameraResult.medicineInfo)}`);
        console.log(`      Audit logged: ${cameraResult.auditLogged}`);
      } catch (error) {
        console.log(`      Error: ${error.message}`);
      }
    }

    console.log('');
  }

  console.log('=== Test Complete ===');
}

// Run the test
testExistingImages().catch(console.error);