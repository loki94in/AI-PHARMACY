export default {
  testMatch: ["**/tests/**/*.test.ts"],
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
  watchPathIgnorePatterns: ['<rootDir>/\\.claude/', '<rootDir>/\\.gemini/']
};
