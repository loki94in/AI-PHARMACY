import dotenv from 'dotenv';
dotenv.config();

import { aiCameraService } from './src/services/aiCameraService.js';
import fs from 'fs';
import path from 'path';
import { ensureSchema } from './src/database.js';
import os from 'os';

async function runTest() {
  const sampleDir = path.resolve(process.cwd(), 'image sample');
  
  if (!fs.existsSync(sampleDir)) {
    console.error(`[Error] Sample directory not found at ${sampleDir}`);
    process.exit(1);
  }

  const files = fs.readdirSync(sampleDir);
  // Automatically check format for JPEG/JPG (and others like PNG)
  const validImageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.webp'];
  
  const imageFiles = files.filter(file => {
    const ext = path.extname(file).toLowerCase();
    return validImageExtensions.includes(ext);
  });

  if (imageFiles.length === 0) {
    console.log(`No valid images found in "${sampleDir}"`);
    process.exit(0);
  }

  console.log(`Found ${imageFiles.length} valid images to test in "${sampleDir}"`);

  // Boot temporary DB for the test
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-batch-test-'));
  const dbPath = path.join(tmpDir, 'app.db');
  await ensureSchema(dbPath);
  process.env.DB_PATH = dbPath;

  for (const file of imageFiles) {
    const filePath = path.join(sampleDir, file);
    console.log(`\n----------------------------------------------------`);
    console.log(`Testing image: ${file}`);
    
    try {
      const imageBuffer = fs.readFileSync(filePath);
      const result = await aiCameraService.processImage(imageBuffer);
      
      console.log(`- Confidence:        ${result.confidence}%`);
      console.log(`- Engine Used:       ${result.fallbackUsed ? 'Tesseract (Fallback)' : 'PaddleOCR (AI)'}`);
      console.log(`- Detected Meds:     ${result.matches.join(', ') || 'None found in DB'}`);
      
      const details = result.medicineInfo || {};
      const parts = [];
      if (details.strength) parts.push(`Strength: ${details.strength}`);
      if (details.batchNumber) parts.push(`Batch: ${details.batchNumber}`);
      if (details.expiryDate) parts.push(`Expiry: ${details.expiryDate}`);
      if (details.mrp) parts.push(`MRP: ${details.mrp}`);
      
      console.log(`- Extracted Details: ${parts.join(' | ') || 'None'}`);
      console.log(`- Extracted Text Snippet:`);
      const lines = result.text.trim().split('\n');
      console.log(lines.slice(0, 5).join('\n') + (lines.length > 5 ? '\n...' : ''));
    } catch (e) {
      console.error(`[Error] Failed to process ${file}:`, e);
    }
  }

  await aiCameraService.terminate();
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  process.exit(0);
}

runTest();
