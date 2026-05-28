// Simple test to verify server file loads without syntax errors
// This doesn't actually start the server, just checks if it can be imported

(async () => {
  try {
    // Test importing our key refactored files
    const dbManager = await import('./src/database/connection.ts');
    console.log('✓ Database connection manager loaded successfully');

    const config = await import('./src/config/index.ts');
    console.log('✓ Configuration manager loaded successfully');

    const invoiceService = await import('./src/services/invoiceService.ts');
    console.log('✓ Invoice service loaded successfully');

    const medicineService = await import('./src/services/medicineService.ts');
    console.log('✓ Medicine service loaded successfully');

    const salesRouter = await import('./src/routes/v1/sales.ts');
    console.log('✓ Sales router loaded successfully');

    const authMiddleware = await import('./src/middleware/auth.ts');
    console.log('✓ Auth middleware loaded successfully');

    console.log('\n✅ All refactored modules loaded successfully!');
    console.log('Note: This test does not start the server or test functionality.');
    console.log('It only verifies that the files can be imported without syntax errors.');
  } catch (error) {
    console.error('❌ Error loading modules:', error.message);
    process.exit(1);
  }
})();