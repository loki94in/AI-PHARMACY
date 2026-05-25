// Test script for AI Camera OCR functionality
import { aiCameraService } from './src/services/aiCameraService.js';

async function testOCR() {
  try {
    console.log('Initializing AI Camera Service...');
    await aiCameraService.initialize();

    console.log('AI Camera Service initialized successfully!');
    console.log('Service is ready to process images.');

    // Clean up
    await aiCameraService.terminate();
    console.log('Test completed successfully!');

  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testOCR();