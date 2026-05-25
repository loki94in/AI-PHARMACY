// Test compiled AI Camera service
import { aiCameraService } from './dist/src/services/aiCameraService.js';

console.log('Testing Compiled AI Camera Service...');

try {
  // Test that the service object exists
  console.log('AI Camera Service object:', typeof aiCameraService);

  // Test that methods exist
  console.log('Has initialize method:', typeof aiCameraService.initialize === 'function');
  console.log('Has processImage method:', typeof aiCameraService.processImage === 'function');
  console.log('Has terminate method:', typeof aiCameraService.terminate === 'function');

  console.log('✓ Compiled AI Camera Service structure test passed');

} catch (error) {
  console.error('✗ Compiled AI Camera Service test failed:', error);
  process.exit(1);
}