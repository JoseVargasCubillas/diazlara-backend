/** Jest config — TypeScript vía ts-jest. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { isolatedModules: true }],
  },
  // Silence noisy logs during tests.
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
};
