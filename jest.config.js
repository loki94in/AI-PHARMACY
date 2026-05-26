export default {
  testMatch: ["**/tests/utilities.test.ts", "**/tests/crm.test.ts", "**/tests/inventoryParser.test.ts", "**/tests/returnsParser.test.ts", "**/tests/salesParser.test.ts", "**/tests/services/productNameFilterService.test.ts", "**/tests/aiCamera.test.ts"],
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/\\.claude/', '<rootDir>/\\.gemini/'],
  modulePathIgnorePatterns: ['<rootDir>/\\.claude/', '<rootDir>/\\.gemini/'],
  watchPathIgnorePatterns: ['/node_modules/', '<rootDir>/\\.claude/', '<rootDir>/\\.gemini/']
};