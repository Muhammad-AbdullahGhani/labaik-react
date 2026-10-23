module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.ts', '<rootDir>/tests/**/*.test.tsx'],
  clearMocks: true,
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/rules/',
    '/tests/integration/',
    '/tests/unit/',
  ],
};
