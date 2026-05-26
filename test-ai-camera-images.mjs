import { aiCameraService } from './src/services/aiCameraService.js';
import { productNameFilterService } from './src/services/productNameFilterService.js';
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
    // Initialize services
    console.log('🔧 Initializing AI Camera Service...');
    await aiCameraService.initialize();
    console.log('✓ AI Camera Service initialized');

    console.log('🔧 Initializing Product Name Filter Service...');
    await productNameFilterService.initialize();
    console.log('✓ Product Name Filter Service initialized');
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
        const aiCameraResult = await aiCameraService.processImage(imageBase64);
        const processTime = Date.now() - processStart;

        // Filter OCR results to show only registered product names
        const filterStart = Date.now();
        const filterResult = await productNameFilterService.filterProductNames(aiCameraResult.text, {
          enableInternetFallback: process.env.ENABLE_INTERNET_FALLBACK === 'true',
          internetApiEndpoint: process.env.PRODUCT_API_ENDPOINT,
          internetApiKey: process.env.PRODUCT_API_KEY,
          minConfidenceThreshold: parseFloat(process.env.PRODUCT_MIN_CONFIDENCE_THRESHOLD || '0.8'),
          fallbackTimeoutMs: parseInt(process.env.PRODUCT_FALLBACK_TIMEOUT_MS || '5000')
        });
        const filterTime = Date.now() - filterStart;

        // Store result
        results.push({
          filename,
          originalText: aiCameraResult.text,
          filteredMatches: filterResult.matches,
          ocrConfidence: aiCameraResult.confidence,
          filterConfidence: filterResult.confidence,
          wordCount: aiCameraResult.words.length,
          processTime,
          filterTime,
          sources: filterResult.sources,
          fallbackUsed: filterResult.fallbackUsed
        });

        // Display result
        console.log(`  📄 Original OCR Text: "${aiCameraResult.text.trim()}"`);
        console.log(`  🎯 OCR Confidence: ${aiCameraResult.confidence}%`);
        console.log(`  📝 Words Detected: ${aiCameraResult.words.length}`);
        console.log(`  🔍 Filtered Product Names: ${filterResult.matches.length > 0 ? filterResult.matches.join(', ') : '(none)'}`);
        console.log(`  📊 Filter Confidence: ${Math.round(filterResult.confidence)}%`);
        console.log(`  🏪 Sources: Local: ${filterResult.sources.local}, Internet: ${filterResult.sources.internet}`);
        if (filterResult.fallbackUsed) {
          console.log(`  🌐 Internet fallback used: Yes`);
        }
        console.log(`  ⏱️  OCR Processing Time: ${processTime}ms`);
        console.log(`  ⏱️  Filtering Time: ${filterTime}ms`);
        console.log('');

      } catch (error) {
        console.error(`  ❌ Failed to process ${filename}:`, error.message);
        console.log('');

        // Still record the failure
        results.push({
          filename,
          originalText: '',
          filteredMatches: [],
          ocrConfidence: 0,
          filterConfidence: 0,
          wordCount: 0,
          processTime: 0,
          filterTime: 0,
          sources: { local: false, internet: false },
          fallbackUsed: false,
          error: error.message
        });
      }
    }

    // Terminate services
    await aiCameraService.terminate();
    await productNameFilterService.terminate ? await productNameFilterService.terminate() : null;
    console.log('✓ AI Camera Service terminated');
    console.log('✓ Product Name Filter Service terminated');

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
      const avgOcrConfidence = successfulResults.reduce((sum, r) => sum + r.ocrConfidence, 0) / successfulResults.length;
      const avgFilterConfidence = successfulResults.reduce((sum, r) => sum + r.filterConfidence, 0) / successfulResults.length;
      console.log(`Average OCR confidence: ${Math.round(avgOcrConfidence)}%`);
      console.log(`Average filter confidence: ${Math.round(avgFilterConfidence)}%`);

      const imagesWithMatches = successfulResults.filter(r => r.filteredMatches.length > 0).length;
      console.log(`Images with product name matches: ${imagesWithMatches}/${successfulResults.length}`);
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
      await productNameFilterService.terminate ? await productNameFilterService.terminate() : null;
    } catch (termError) {
      console.error('Error during termination:', termError);
    }
    process.exit(1);
  }
}

// Run the test
testUserImages();