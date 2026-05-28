import { paddleOcrService } from './src/services/paddleOcrService.js';
import { aiCameraService } from './src/services/aiCameraService.js';
import fs from 'fs';
import path from 'path';

// Create a simple test image if none exists (white background with black text)
async function createTestImage() {
  const { createCanvas } = await import('canvas');
  const canvas = createCanvas(400, 200);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Black text
  ctx.fillStyle = 'black';
  ctx.font = '24px Arial';
  ctx.fillText('PARACETAMOL 500MG', 50, 100);
  ctx.fillText('BATCH: ABC123', 50, 140);

  const buffer = canvas.toBuffer('image/png');
  const testDir = path.resolve(process.cwd(), 'data', 'test');
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  const testImagePath = path.resolve(testDir, 'test-medicine-label.png');
  fs.writeFileSync(testImagePath, buffer);
  return testImagePath;
}

async function testOCRPerformance() {
  console.log('=== Manual OCR Performance Test ===\n');

  // Ensure we have a test image
  let testImagePath = path.resolve(process.cwd(), 'data', 'test', 'test-medicine-label.png');
  if (!fs.existsSync(testImagePath)) {
    console.log('Creating test image...');
    testImagePath = await createTestImage();
    console.log(`Test image created: ${testImagePath}\n`);
  }

  // Check PaddleOCR availability
  console.log('1. Checking PaddleOCR availability...');
  const availabilityStart = Date.now();
  const isAvailable = await paddleOcrService.checkAvailability();
  const availabilityTime = Date.now() - availabilityStart;

  console.log(`   Available: ${isAvailable}`);
  console.log(`   Check time: ${availabilityTime}ms\n`);

  if (!isAvailable) {
    console.log('PaddleOCR not available. Install Python and paddleocr package to test it.');
    console.log('Falling back to Tesseract.js testing...\n');

    // Test Tesseract.js directly
    console.log('2. Testing Tesseract.js OCR...');
    const tesseractStart = Date.now();
    try {
      const result = await aiCameraService.processImage(testImagePath);
      const tesseractTime = Date.now() - tesseractStart;

      console.log(`   Processing time: ${tesseractTime}ms`);
      console.log(`   Extracted text: "${result.text}"`);
      console.log(`   Confidence: ${result.confidence}%`);
      console.log(`   Words found: ${result.words.length}`);
      console.log(`   Medicine matches: ${result.matches.length}`);
      if (result.matches.length > 0) {
        console.log(`   Top match: "${result.matches[0]}"`);
      }
      console.log(`   Fallback used: ${result.fallbackUsed}`);
      console.log(`   Audit logged: ${result.auditLogged}`);
    } catch (error) {
      console.error(`   Error: ${error.message}`);
    }
    return;
  }

  // Test PaddleOCR
  console.log('2. Testing PaddleOCR...');
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

  // Test AI Camera Service (which may use PaddleOCR or fallback)
  console.log('\n3. Testing AI Camera Service...');
  const cameraStart = Date.now();
  try {
    const cameraResult = await aiCameraService.processImage(testImagePath);
    const cameraTime = Date.now() - cameraStart;

    console.log(`   Processing time: ${cameraTime}ms`);
    console.log(`   Fallback used: ${cameraResult.fallbackUsed}`);
    console.log(`   Extracted text: "${cameraResult.text}"`);
    console.log(`   Confidence: ${cameraResult.confidence}%`);
    console.log(`   Words found: ${cameraResult.words.length}`);
    console.log(`   Medicine matches: ${cameraResult.matches.length}`);
    if (cameraResult.matches.length > 0) {
      console.log(`   Top match: "${cameraResult.matches[0]}"`);
    }
    console.log(`   Medicine info:`, JSON.stringify(cameraResult.medicineInfo, null, 2));
    console.log(`   Audit logged: ${cameraResult.auditLogged}`);
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }

  console.log('\n=== Test Complete ===');
}

// Run the test
testOCRPerformance().catch(console.error);