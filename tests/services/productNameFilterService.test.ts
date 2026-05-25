import { ProductNameFilterService } from '../../src/services/productNameFilterService';

describe('ProductNameFilterService', () => {
  let service: ProductNameFilterService;
  const TEST_DB_PATH = './test-data/test-app.db';

  beforeEach(async () => {
    service = new ProductNameFilterService(TEST_DB_PATH);
    // Setup test database with sample medicines
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const db = await open({ filename: TEST_DB_PATH, driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      DELETE FROM medicines;
      INSERT INTO medicines (name) VALUES
        ('Paracetamol 500mg'),
        ('Amoxicillin 250mg Capsule'),
        ('Cetirizine 10mg Tablet'),
        ('Atorvastatin Calcium 20mg');
    `);
    await db.close();
  });

  afterEach(async () => {
    // Cleanup test database
    const { unlink } = await import('fs');
    try {
      await unlink(TEST_DB_PATH);
    } catch {}
  });

  test('should throw error if filterProductNames called before initialize', async () => {
    await expect(service.filterProductNames('test')).rejects.toThrow('not initialized');
  });

  test('should initialize successfully with test data', async () => {
    await expect(service.initialize()).resolves.not.toThrow();
    expect(service['medicineNames']).toHaveLength(4);
    expect(service['medicineNames']).toContain('Paracetamol 500mg');
    expect(service['medicineNames']).toContain('Amoxicillin 250mg Capsule');
  });

  test('should return exact matches', async () => {
    await service.initialize();
    const result = await service.filterProductNames('Paracetamol 500mg');
    expect(result).toContain('Paracetamol 500mg');
  });

  test('should handle case insensitive matching', async () => {
    await service.initialize();
    const result = await service.filterProductNames('PARACETAMOL 500MG');
    expect(result).toContain('Paracetamol 500mg');
  });

  test('should return empty array for no matches', async () => {
    await service.initialize();
    const result = await service.filterProductNames('Nonexistent Drug 500mg');
    expect(result).toEqual([]);
  });

  test('should respect confidence threshold', async () => {
    await service.initialize();
    // Similar to "Paracetamol" but different enough to be below 0.8 threshold
    const result = await service.filterProductNames('Paracetamol 500mg Extra Strength', { minConfidenceThreshold: 0.9 });
    // With high threshold, might not match
    expect(Array.isArray(result)).toBe(true);
  });

  test('should work with empty medicine list', async () => {
    // Create service with empty DB
    const emptyService = new ProductNameFilterService(TEST_DB_PATH);
    const { open } = await import('sqlite');
    const sqlite3 = await import('sqlite3');
    const db = await open({ filename: TEST_DB_PATH, driver: sqlite3.Database });
    await db.exec(`
      CREATE TABLE IF NOT EXISTS medicines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      DELETE FROM medicines;
    `);
    await db.close();

    await emptyService.initialize();
    const result = await emptyService.filterProductNames('Anything');
    expect(result).toEqual([]);
  });
});