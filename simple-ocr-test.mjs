import { paddleOcrService } from './src/services/paddleOcrService.js';
import { aiCameraService } from './src/services/aiCameraService.js';
import fs from 'fs';
import path from 'path';

async function simpleOCRTest() {
  console.log('=== Simple OCR Test ===\n');

  // Create a simple test image in memory (white background with black text)
  // Since we can't easily create canvas, let's use one of the existing audit images
  const auditImagesDir = path.resolve(process.cwd(), 'data', 'audit_images');
  const files = fs.readdirSync(auditImagesDir)
    .filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.bmp', '.tiff'].includes(ext);
    });

  if (files.length === 0) {
    console.log('No audit images found to test');
    return;
  }

  const testImagePath = path.resolve(auditImagesDir, files[0]);
  console.log(`Using test image: ${files[0]}\n`);

  // Check PaddleOCR availability
  console.log('1. Checking PaddleOCR availability...');
  const availabilityStart = Date.now();
  const isAvailable = await paddleOcrService.checkAvailability();
  const availabilityTime = Date.now() - availabilityStart;

  console.log(`   Available: ${isAvailable}`);
  console.log(`   Check time: ${availabilityTime}ms\n`);

  if (!isAvailable) {
    console.log('PaddleOCR not available. Testing with Tesseract.js only...\n');

    // Test Tesseract.js via AI Camera Service
    console.log('2. Testing Tesseract.js OCR via AI Camera Service...');
    const cameraStart = Date.now();
    try {
      const imageBuffer = fs.readFileSync(testImagePath);
      const cameraResult = await aiCameraService.processImage(imageBuffer);
      const cameraTime = Date.now() - cameraStart;

      console.log(`   Processing time: ${cameraTime}ms`);
      console.log(`   Fallback used: ${cameraResult.fallbackUsed}`);
      console.log(`   Extracted text: "${cameraResult.text}"`);
      console.log(`   Confidence: ${cameraResult.confidence}%`);
      console.log(`   Words found: ${cameraResult.words.length}`);
      console.log(`   Medicine matches: ${cameraResult.matches.length}`);
      if (cameraResult.matches.length > 0) {
        console.log(`   Top matches: ${cameraResult.matches.slice(0, 3).join(', ')}`);
      }
      console.log(`   Medicine info: ${JSON.stringify(cameraResult.medicineInfo)}`);
      console.log(`   Audit logged: ${cameraResult.auditLogged}`);
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
  } else {
    // Test with PaddleOCR directly
    console.log('2. Testing with PaddleOCR...');
    const paddleStart = Date.now();
    try {
      const paddleResult = await paddleOcrService.scanImage(testImagePath);
      const paddleTime = Date.now() - paddleStart;

      console.log(`   Processing time: ${paddleTime}ms`);
      console.log(`   Success: ${paddleResult.success}`);
      if (paddleResult.success) {
        console.log(`   Extracted text: "${paddleResult.text}"`);
        console.log(`   Words found: ${paddleResult.words?.length || 0}`);
        console.log(`   Average confidence: ${paddleResult.confidence || 0}%`);
      } else {
        console.log(`   Error: ${paddleResult.error}`);
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }

    // Also test with AI Camera Service
    console.log('\n3. Testing with AI Camera Service...');
    const cameraStart = Date.now();
    try {
      const imageBuffer = fs.readFileSync(testImagePath);
      const cameraResult = await aiCameraService.processImage(imageBuffer);
      const cameraTime = Date.now() - cameraStart;

      console.log(`   Processing time: ${cameraTime}ms`);
      console.log(`   Fallback used: ${cameraResult.fallbackUsed}`);
      console.log(`   Extracted text: "${cameraResult.text}"`);
      console.log(`   Confidence: ${cameraResult.confidence}%`);
      console.log(`   Words found: ${cameraResult.words.length}`);
      console.log(`   Medicine matches: ${cameraResult.matches.length}`);
      if (cameraResult.matches.length > 0) {
        console.log(`   Top matches: ${cameraResult.matches.slice(0, 3).join(', ')}`);
      }
      console.log(`   Medicine info: ${JSON.stringify(cameraResult.medicineInfo)}`);
      console.log(`   Audit logged: ${cameraResult.auditLogged}`);
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
  }

  console.log('\n=== Test Complete ===');
}

// Run the test
simpleOCRTest().catch(console.error);