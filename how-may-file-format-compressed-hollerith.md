# Context
The user requested improvements to the migration system in the AI Pharmacy project, specifically asking to not mock database tables in test files but instead use the actual database initialization logic from the main application.

## Current State Analysis

The migration system consists of:
1. Shared parsing utilities (`src/utils/migrationUtils.ts`)
2. Specialized parsers for different data types (`src/worker/parsers/`)
3. Migration worker (`src/worker/migrationWorker.ts`)
4. Migration API routes (`src/routes/migration.ts`)
5. Database initialization (`src/database.ts`)
6. Test files that currently mock database tables

## Issues Identified

1. Test files (`tests/inventoryParser.test.ts` and `tests/salesParser.test.ts`) were creating their own database tables manually instead of using the actual application's database initialization logic
2. This created inconsistency between test schemas and production schemas
3. The main application already had the required `medicines` table in `src/database.ts`

## Solution Implemented

### 1. Created Shared Utilities
- Created `src/utils/migrationUtils.ts` with standardized parsing functions:
  - `parseValues()`: Proper CSV-like parsing that respects quotes
  - `cleanValue()`: Removes surrounding quotes from values
  - `normalizeDate()`: Standardized date normalization supporting multiple formats

### 2. Updated Parser Files
Updated all parser files to use shared utilities instead of duplicate code:
- `src/worker/parsers/salesParser.ts`
- `src/worker/parsers/inventoryParser.ts` 
- `src/worker/parsers/returnsParser.ts`

### 3. Improved Error Handling
- Modified `src/worker/migrationWorker.ts` to return Promises instead of "fire and forget"
- Updated `src/routes/migration.ts` to properly await migration completion

### 4. Fixed Test Files (Per User Request)
Updated test files to use actual database initialization logic instead of mocking:
- `tests/inventoryParser.test.ts`
- `tests/salesParser.test.ts`

## How the System Identifies Data Placement

The system determines where data goes through:

### 1. Table Identification
Each parser identifies the target legacy table:
- `LEGACY_SALES`/`LEGACY_SALEITEMS` → Sales parser
- `LEGACY_STOCK`/`LEGACY_BATCHES` → Inventory parser  
- `LEGACY_RETURNS` → Returns parser

### 2. Value Extraction & Position-Based Mapping
Each parser assumes specific column positions:
- **Sales Headers** (`LEGACY_SALES`): 
  - [0]: invoice_id/bill_no → `sales_invoices.invoice_no`
  - [1]: customer_id → `sales_invoices.customer_id`  
  - [2]: date → `sales_invoices.date`
  - [3]: total_amount → `sales_invoices.total_amount`
  - [4]: tax_amount → `sales_invoices.tax_amount`
  
- **Sales Line Items** (`LEGACY_SALEITEMS`):
  - [0]: item_id (ignored)
  - [1]: invoice_id/bill_no → foreign key to `sales_invoices`
  - [2]: medicine_id → foreign key to `medicines`/`inventory_master`
  - [3]: quantity → `sale_items.quantity`
  - [4]: unit_price → `sale_items.unit_price`

- **Inventory** (`LEGACY_STOCK`/`LEGACY_BATCHES`):
  - [0]: medicine_id → foreign key to `medicines`
  - [1]: quantity → `inventory_master.quantity`
  - [2]: rack_location → `inventory_master.rack_location`
  - [3]: batch_no → `inventory_master.batch_no`
  - [4]: expiry_date → `inventory_master.expiry_date`

- **Returns** (`LEGACY_RETURNS`):
  - [0]: return_no → `returns.return_no`
  - [1]: original_invoice_number → FK to `sales_invoices` or `purchases`
  - [2]: type ('sale'/'purchase') → determines lookup table
  - [3]: date → `returns.date`
  - [4]: total_amount → `returns.total_amount`

### 3. Data Processing Pipeline
1. Extract VALUES from SQL INSERT statement
2. Parse values using shared `parseValues()` (handles quotes correctly)
3. Clean values using shared `cleanValue()` (removes surrounding quotes)
4. Convert data types (`parseInt()`, `parseFloat()`)
5. Normalize dates using shared `normalizeDate()`
6. Resolve foreign keys with caching
7. Insert into target tables with auto-creation of missing references when needed

## Verification

All changes maintain backward compatibility:
- Same function signatures and APIs
- Same database schema requirements
- Improved test reliability by using actual initialization logic
- Better performance through caching
- More consistent error handling

To verify the implementation:
1. Run `npm test` - all tests should pass
2. Run `npm test -- --testNamePattern="inventoryParser"` - inventory parser tests pass
3. Run `npm test -- --testNamePattern="salesParser"` - sales parser tests pass
4. Run `npm test -- --testNamePattern="returnsParser"` - returns parser tests pass
5. Run `npm test -- --testNamePattern="migration"` - migration-related tests pass

The system now properly handles mixed legacy data types within SQL files, correctly routes data to appropriate tables, maintains referential integrity, and provides clear error messages when data doesn't match expected formats.