module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: [
    './node_modules/react-native-gesture-handler/jestSetup.js',
    './jest.setup.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((@)?react-native|react-native-gesture-handler)/)',
  ],
  moduleNameMapper: {
    '\\.(png|jpg|jpeg|gif)$': '<rootDir>/__mocks__/fileMock.js',
  },
};
