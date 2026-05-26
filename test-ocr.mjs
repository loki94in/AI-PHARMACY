import fs from 'fs';
import path from 'path';
import { aiCameraService } from './src/services/aiCameraService.ts';

// Initialize the service
async function testImages() {
  await aiCameraService.initialize();

  const testImagesDir = path.join(process.cwd(), 'test-images');
  const files = fs.readdirSync(testImagesDir)
    .filter(file => file.match(/\.(jpg|jpeg|png)$/i));

  console.log(`Found ${files.length} test images:`);

  for (const file of files) {
    console.log(`\nProcessing: ${file}`);
    const imagePath = path.join(testImagesDir, file);
    const imageBuffer = fs.readFileSync(imagePath);

    try {
      const result = await aiCameraService.processImage(imageBuffer);
      console.log(`OCR Text: "${result.text}"`);
      console.log(`Confidence: ${result.confidence}%`);
      console.log(`Medicine Info:`, JSON.stringify(result.medicineInfo, null, 2));
      console.log(`Matches:`, result.matches);
    } catch (error) {
      console.error(`Error processing ${file}:`, error.message);
    }
  }

  await aiCameraService.terminate();
}

testImages().catch(console.error);