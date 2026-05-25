// Test AI Camera OCR functionality
import { aiCameraService } from './dist/src/services/aiCameraService.js';

async function testOCR() {
  console.log('Testing AI Camera OCR functionality...');

  try {
    // Initialize the service
    console.log('Initializing AI Camera Service...');
    await aiCameraService.initialize();
    console.log('✓ AI Camera Service initialized');

    // Test with a simple base64 image (1x1 pixel white image)
    const testImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    console.log('Processing test image...');
    const result = await aiCameraService.processImage(testImageBase64);
    console.log('✓ Image processed successfully');
    console.log('OCR Result:', {
      text: result.text.substring(0, 100) + (result.text.length > 100 ? '...' : ''),
      confidence: result.confidence,
      wordCount: result.words.length
    });

    // Terminate the service
    await aiCameraService.terminate();
    console.log('✓ AI Camera Service terminated');

    console.log('✓ All OCR functionality tests passed');

  } catch (error) {
    console.error('✗ OCR functionality test failed:', error);
    // Try to terminate even if there was an error
    try {
      await aiCameraService.terminate();
    } catch (termError) {
      console.error('Error during termination:', termError);
    }
    process.exit(1);
  }
}

testOCR();