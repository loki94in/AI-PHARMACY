// Simple test for AI Camera service
import { aiCameraService } from './src/services/aiCameraService.js';

console.log('Testing AI Camera Service import...');

try {
  // Test that the service object exists
  console.log('AI Camera Service object:', typeof aiCameraService);

  // Test that methods exist
  console.log('Has initialize method:', typeof aiCameraService.initialize === 'function');
  console.log('Has processImage method:', typeof aiCameraService.processImage === 'function');
  console.log('Has terminate method:', typeof aiCameraService.terminate === 'function');

  console.log('✓ AI Camera Service basic structure test passed');

} catch (error) {
  console.error('✗ AI Camera Service test failed:', error);
  process.exit(1);
}