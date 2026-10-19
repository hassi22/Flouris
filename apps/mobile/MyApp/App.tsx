/**
 * App.tsx — Flouris ERP Mobile (bare React Native)
 * Root entry: wraps all providers then mounts AppNavigator.
 */

import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LanguageProvider } from './src/context/LanguageContext';
import { DatabaseProvider } from './src/context/DatabaseContext';
import AppNavigator from './src/navigation/AppNavigator';
import { COLORS } from './src/components/theme';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <LanguageProvider>
          <DatabaseProvider>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
            <AppNavigator />
          </DatabaseProvider>
        </LanguageProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
