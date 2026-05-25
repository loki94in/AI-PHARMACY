// Test AI Camera OCR functionality with user images
import { aiCameraService } from './dist/src/services/aiCameraService.js';
import fs from 'fs';
import path from 'path';

async function testUserImages() {
  console.log('Testing AI Camera OCR with user images...');

  const testImagesDir = path.join(process.cwd(), 'test-images');

  // Check if test-images directory exists
  if (!fs.existsSync(testImagesDir)) {
    console.error('❌ Test images directory not found:', testImagesDir);
    console.log('Please create a "test-images" folder in the project root and add your images there.');
    process.exit(1);
  }

  // Get all files in test-images directory
  const files = fs.readdirSync(testImagesDir);

  // Filter for common image formats
  const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp'].includes(ext);
  });

  if (imageFiles.length === 0) {
    console.error('❌ No image files found in test-images directory');
    console.log('Supported formats: JPG, JPEG, PNG, BMP, TIFF, WEBP');
    process.exit(1);
  }

  console.log(`📁 Found ${imageFiles.length} image(s) to process:`);
  imageFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file}`);
  });
  console.log('');

  try {
    // Initialize the service
    console.log('🔧 Initializing AI Camera Service...');
    await aiCameraService.initialize();
    console.log('✓ AI Camera Service initialized');
    console.log('');

    // Process each image
    const startTime = Date.now();
    const results = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const filename = imageFiles[i];
      const filePath = path.join(testImagesDir, filename);

      console.log(`🔍 Processing ${filename}...`);

      try {
        // Read image file and convert to base64
        const imageBuffer = fs.readFileSync(filePath);
        const imageBase64 = `data:image/${path.extname(filename).slice(1)};base64,${imageBuffer.toString('base64')}`;

        // Process image with AI Camera service
        const processStart = Date.now();
        const result = await aiCameraService.processImage(imageBase64);
        const processTime = Date.now() - processStart;

        // Store result
        results.push({
          filename,
          text: result.text,
          confidence: result.confidence,
          wordCount: result.words.length,
          processTime
        });

        // Display result
        console.log(`  📄 OCR Text: "${result.text.trim()}"`);
        console.log(`  🎯 Confidence: ${result.confidence}%`);
        console.log(`  📝 Words Detected: ${result.words.length}`);
        console.log(`  ⏱️  Processing Time: ${processTime}ms`);
        console.log('');

      } catch (error) {
        console.error(`  ❌ Failed to process ${filename}:`, error.message);
        console.log('');

        // Still record the failure
        results.push({
          filename,
          text: '',
          confidence: 0,
          wordCount: 0,
          processTime: 0,
          error: error.message
        });
      }
    }

    // Terminate the service
    await aiCameraService.terminate();
    console.log('✓ AI Camera Service terminated');

    // Summary
    const totalTime = Date.now() - startTime;
    const successfulResults = results.filter(r => !r.error);
    const failedResults = results.filter(r => r.error);

    console.log('📊 SUMMARY');
    console.log('=========');
    console.log(`Total images processed: ${imageFiles.length}`);
    console.log(`Successful: ${successfulResults.length}`);
    console.log(`Failed: ${failedResults.length}`);
    console.log(`Total processing time: ${totalTime}ms`);
    console.log(`Average time per image: ${Math.round(totalTime / imageFiles.length)}ms`);

    if (successfulResults.length > 0) {
      const avgConfidence = successfulResults.reduce((sum, r) => sum + r.confidence, 0) / successfulResults.length;
      console.log(`Average confidence: ${Math.round(avgConfidence)}%`);
    }

    if (failedResults.length > 0) {
      console.log('');
      console.log('❌ FAILED IMAGES:');
      failedResults.forEach(result => {
        console.log(`  ${result.filename}: ${result.error}`);
      });
    }

    console.log('');
    console.log('✅ Testing completed!');

  } catch (error) {
    console.error('❌ Testing failed:', error);
    // Try to terminate even if there was an error
    try {
      await aiCameraService.terminate();
    } catch (termError) {
      console.error('Error during termination:', termError);
    }
    process.exit(1);
  }
}

// Run the test
testUserImages();