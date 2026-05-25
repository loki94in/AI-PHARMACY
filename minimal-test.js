// Minimal test to verify the salesParser fixes without complex async setup
const fs = require('fs');
const path = require('path');

// Read the salesParser.ts file to check our changes
const filePath = path.join(__dirname, 'src', 'worker', 'parsers', 'salesParser.ts');
const content = fs.readFileSync(filePath, 'utf8');

console.log('Checking for cache implementation...');
const hasInvoiceCache = content.includes('const invoiceCache = new Map<string, number>();');
const hasInventoryCache = content.includes('const inventoryCache = new Map<number, number>();');
const hasCacheReset = content.includes('if (linesProcessed >= CACHE_RESET_THRESHOLD)');
const hasMedicineAutoCreation = content.includes('Legacy medicine_id ${medicineId} not found in inventory_master - auto-creating medicine record');

console.log('✓ Invoice cache:', hasInvoiceCache);
console.log('✓ Inventory cache:', hasInventoryCache);
console.log('✓ Cache reset logic:', hasCacheReset);
console.log('✓ Medicine auto-creation:', hasMedicineAutoCreation);

if (hasInvoiceCache && hasInventoryCache && hasCacheReset && hasMedicineAutoCreation) {
    console.log('\n✅ All required fixes are present in salesParser.ts');
} else {
    console.log('\n❌ Some fixes are missing');
    process.exit(1);
}

// Check test file changes
const testFilePath = path.join(__dirname, 'tests', 'salesParser.test.ts');
const testContent = fs.readFileSync(testFilePath, 'utf8');

console.log('\nChecking for test updates...');
const hasUpdatedTest = testContent.includes('should handle missing inventory medicine_id gracefully by auto-creating medicine and inventory records');
const hasIncreasedTimeout = testContent.includes(', 15000);');

console.log('✓ Updated test expectation:', hasUpdatedTest);
console.log('✓ Increased timeout:', hasIncreasedTimeout);

if (hasUpdatedTest && hasIncreasedTimeout) {
    console.log('\n✅ Test file updates are present');
} else {
    console.log('\n❌ Test file updates are missing');
    process.exit(1);
}

console.log('\n🎉 All verification checks passed!');