console.log('Simple test starting');

// Import the function directly
import { processSalesLine } from './src/worker/parsers/salesParser.ts';

console.log('Import successful');

// Create a mock database object for testing
const mockDb = {
  run: (query: string, params: any[], callback: (err: Error | null) => void) => {
    console.log('Mock DB run called:', query);
    callback(null);
    return {
      lastID: 1
    };
  },
  get: async (query: string, params: any[]) => {
    console.log('Mock DB get called:', query);
    if (query.includes('sales_invoices') && query.includes('invoice_no')) {
      return { id: 1 };
    }
    if (query.includes('inventory_master') && query.includes('medicine_id')) {
      return { id: 1 };
    }
    if (query.includes('medicines') && query.includes('id')) {
      return { id: 1 };
    }
    return null;
  }
};

console.log('Testing processSalesLine...');
const result = await processSalesLine("INSERT INTO legacy_sales VALUES (1001, 1, '2024-01-15', 500.0, 25.0);", mockDb);
console.log('Result:', result);