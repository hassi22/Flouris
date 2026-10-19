/* eslint-env jest */

import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

jest.mock('react-native-fs', () => ({
	DocumentDirectoryPath: '/tmp',
	ExternalDirectoryPath: '/tmp',
	readDir: jest.fn().mockResolvedValue([]),
	exists: jest.fn().mockResolvedValue(false),
}));

jest.mock('@op-engineering/op-sqlite', () => ({
	open: jest.fn(),
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Icon');
jest.mock('react-native-chart-kit', () => ({
	BarChart: 'BarChart',
}));
jest.mock('react-native-image-picker', () => ({
	launchImageLibrary: jest.fn(),
}));
jest.mock('react-native-html-to-pdf', () => ({
	convert: jest.fn(),
}));
jest.mock('react-native-share', () => ({
	open: jest.fn(),
}));
