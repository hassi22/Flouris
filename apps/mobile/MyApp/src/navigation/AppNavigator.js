/**
 * AppNavigator.js — Flouris ERP Mobile (bare RN)
 * Root stack navigator wrapping the tab navigator + all modal/stack screens.
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import TabNavigator from './TabNavigator';

// Reports
import TrialBalance     from '../screens/reports/TrialBalance';
import BalanceSheet     from '../screens/reports/BalanceSheet';
import ProfitLoss       from '../screens/reports/ProfitLoss';
import AccountStatement from '../screens/reports/AccountStatement';
import Register         from '../screens/reports/Register';

// Vouchers
import VoucherEntry from '../screens/vouchers/VoucherEntry';
import VoucherForm  from '../screens/vouchers/VoucherForm';

// Accounts
import AccountManager from '../screens/accounts/AccountManager';
import AccountGroups  from '../screens/accounts/AccountGroups';
import VoucherTypes   from '../screens/accounts/VoucherTypes';

// Databases
import DatabaseSelector from '../screens/databases/DatabaseSelector';
import CreateDatabase   from '../screens/databases/CreateDatabase';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/* Tabs are the root screen */}
        <Stack.Screen
          name="Tabs"
          component={TabNavigator}
          options={{ headerShown: false }}
        />

        {/* Reports */}
        <Stack.Screen name="TrialBalance"     component={TrialBalance}     options={{ title: 'Trial Balance' }} />
        <Stack.Screen name="BalanceSheet"     component={BalanceSheet}     options={{ title: 'Balance Sheet' }} />
        <Stack.Screen name="ProfitLoss"       component={ProfitLoss}       options={{ title: 'Profit & Loss' }} />
        <Stack.Screen name="AccountStatement" component={AccountStatement} options={{ title: 'Account Statement' }} />
        <Stack.Screen name="Register"         component={Register}         options={{ title: 'Register' }} />

        {/* Vouchers */}
        <Stack.Screen name="VoucherEntry" component={VoucherEntry} options={{ title: 'Voucher Entry' }} />
        <Stack.Screen name="VoucherForm"  component={VoucherForm}  options={{ title: 'New Voucher' }} />

        {/* Accounts */}
        <Stack.Screen name="AccountManager" component={AccountManager} options={{ title: 'Account Manager' }} />
        <Stack.Screen name="AccountGroups"  component={AccountGroups}  options={{ title: 'Account Groups' }} />
        <Stack.Screen name="VoucherTypes"   component={VoucherTypes}   options={{ title: 'Voucher Types' }} />

        {/* Databases */}
        <Stack.Screen name="DatabaseSelector" component={DatabaseSelector} options={{ title: 'Databases' }} />
        <Stack.Screen name="CreateDatabase"   component={CreateDatabase}   options={{ title: 'New Database' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
