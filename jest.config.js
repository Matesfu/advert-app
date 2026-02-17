/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    forceExit: true,
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
    // Map ESM-only packages to manual CJS mocks
    moduleNameMapper: {
        '^uuid$': '<rootDir>/src/__mocks__/uuid.js',
    },
};
