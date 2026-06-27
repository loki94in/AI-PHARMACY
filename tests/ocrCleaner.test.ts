import { isValidMedicineNameCandidate, cleanMedicineNameLine, extractMedicineNameFromText } from '../src/utils/ocrCleaner.js';

describe('OCR Cleaner Utility', () => {
  describe('isValidMedicineNameCandidate', () => {
    test('should reject lines containing drug license details', () => {
      expect(isValidMedicineNameCandidate('DL NO: MH-12-34567')).toBe(false);
      expect(isValidMedicineNameCandidate('D.L. 20B/21B')).toBe(false);
      expect(isValidMedicineNameCandidate('DRUG LIC NO: 12345')).toBe(false);
    });

    test('should reject lines containing phone numbers', () => {
      expect(isValidMedicineNameCandidate('PHONE: 9876543210')).toBe(false);
      expect(isValidMedicineNameCandidate('PH: +91 9988776655')).toBe(false);
      expect(isValidMedicineNameCandidate('Mob No. 8888888888')).toBe(false);
    });

    test('should reject lines containing GSTIN or tax identifiers', () => {
      expect(isValidMedicineNameCandidate('GSTIN: 27AAAAA1111A1Z1')).toBe(false);
      expect(isValidMedicineNameCandidate('GST NO. 27AAAAA1111A1Z1')).toBe(false);
      expect(isValidMedicineNameCandidate('PAN NO: ABCDE1234F')).toBe(false);
    });

    test('should reject invoice/bill identifiers and totals', () => {
      expect(isValidMedicineNameCandidate('TAX INVOICE')).toBe(false);
      expect(isValidMedicineNameCandidate('CASH MEMO')).toBe(false);
      expect(isValidMedicineNameCandidate('INVOICE NO: INV-2026-001')).toBe(false);
      expect(isValidMedicineNameCandidate('TOTAL AMOUNT: 540.00')).toBe(false);
      expect(isValidMedicineNameCandidate('QTY: 10')).toBe(false);
      expect(isValidMedicineNameCandidate('SUBTOTAL')).toBe(false);
    });

    test('should reject doctor/patient header lines', () => {
      expect(isValidMedicineNameCandidate('Dr. Rajesh Sharma')).toBe(false);
      expect(isValidMedicineNameCandidate('PATIENT: Ramesh Kumar')).toBe(false);
      expect(isValidMedicineNameCandidate('CUSTOMER NAME: John Doe')).toBe(false);
    });

    test('should reject lines with mostly digits', () => {
      expect(isValidMedicineNameCandidate('9876543210')).toBe(false);
      expect(isValidMedicineNameCandidate('400001')).toBe(false); // Postal code
    });

    test('should accept valid medicine names', () => {
      expect(isValidMedicineNameCandidate('METACARD 25 MG')).toBe(true);
      expect(isValidMedicineNameCandidate('CALPOL 650 TABLET')).toBe(true);
      expect(isValidMedicineNameCandidate('CROCIN')).toBe(true);
      expect(isValidMedicineNameCandidate('PAN-D CAPSULE')).toBe(true);
    });
  });

  describe('cleanMedicineNameLine', () => {
    test('should strip serial number prefixes', () => {
      expect(cleanMedicineNameLine('1. CALPOL 650')).toBe('CALPOL 650');
      expect(cleanMedicineNameLine('02) SHELCAL 500')).toBe('SHELCAL 500');
      expect(cleanMedicineNameLine('15 - PAN D')).toBe('PAN D');
    });

    test('should strip leading punctuation or symbol noise', () => {
      expect(cleanMedicineNameLine('- CROCIN')).toBe('CROCIN');
      expect(cleanMedicineNameLine('* PAN-D')).toBe('PAN-D');
      expect(cleanMedicineNameLine(', METACARD')).toBe('METACARD');
    });
  });

  describe('extractMedicineNameFromText', () => {
    test('should extract the first valid candidate line from invoice text', () => {
      const ocrText = `
        TAX INVOICE
        CARE PHARMACY
        DL NO: 12345
        PH: 9876543210
        Date: 26/06/2026
        ------------------
        1. CALPOL 650 TABLET
        Batch: C1234 Exp: 12/28
        MRP: 30.00 Qty: 1
      `;
      expect(extractMedicineNameFromText(ocrText)).toBe('CALPOL 650 TABLET');
    });

    test('should fall back to first non-empty line with letters if no line is fully valid', () => {
      const badOcrText = `
        TAX INVOICE
        TOTAL: 500.00
      `;
      // It has no lines passing the full validation, so it falls back to first clean line with letters
      expect(extractMedicineNameFromText(badOcrText)).toBe('TAX INVOICE');
    });
  });
});
