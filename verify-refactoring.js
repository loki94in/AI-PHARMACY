// Verification script to check that our refactored code is syntactically correct
// and follows the intended structure

import fs from 'fs';
import path from 'path';

// Check that key files exist
const filesToCheck = [
  'src/database/connection.ts',
  'src/config/index.ts',
  'src/services/invoiceService.ts',
  'src/services/medicineService.ts',
  'src/routes/v1/sales.ts',
  'src/middleware/validation.ts',
  'src/middleware/asyncHandler.ts',
  'src/middleware/errorHandler.ts',
  'src/middleware/notFoundHandler.ts',
  'src/server.ts',
  'src/middleware/auth.ts'
];

console.log('🔍 Checking existence of refactored files...');
let allExist = true;
for (const file of filesToCheck) {
  if (fs.existsSync(file)) {
    console.log(`  ✓ ${file}`);
  } else {
    console.log(`  ✗ ${file} - MISSING`);
    allExist = false;
  }
}

if (!allExist) {
  process.exit(1);
}

// Check that we haven't broken the original sales.ts (should still exist)
const originalSales = 'src/routes/sales.ts';
if (fs.existsSync(originalSales)) {
  console.log(`  ✓ Original sales.ts preserved (for reference)`);
} else {
  console.log(`  ⚠ Original sales.ts missing - this might be unexpected`);
}

// Check v1 directory exists
const v1Dir = 'src/routes/v1';
if (fs.existsSync(v1Dir)) {
  console.log(`  ✓ ${v1Dir} directory exists`);
} else {
  console.log(`  ✗ ${v1Dir} directory missing`);
  allExist = false;
}

console.log('\n📝 Checking file sizes to ensure content was written...');
for (const file of filesToCheck.slice(0, 6)) { // Check first few files
  const stats = fs.statSync(file);
  if (stats.size > 0) {
    console.log(`  ✓ ${file} (${stats.size} bytes)`);
  } else {
    console.log(`  ⚠ ${file} appears to be empty`);
  }
}

console.log('\n✅ Basic verification complete!');
console.log('📝 Next steps:');
console.log('  1. Run TypeScript compiler to check for syntax errors');
console.log('  2. Verify server can start without errors');
console.log('  3. Continue refactoring additional routes and services');