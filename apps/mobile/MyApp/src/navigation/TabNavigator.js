/**
 * TabNavigator.js — Flouris ERP Mobile (bare RN)
 * Bottom tab bar: Dashboard, Reports, Vouchers, Settings.
 * Uses react-native-vector-icons/Ionicons.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/Ionicons';
import { COLORS } from '../components/theme';
import { useLang } from '../context/LanguageContext';

import Dashboard from '../screens/tabs/Dashboard';
import Reports   from '../screens/tabs/Reports';
import Settings  from '../screens/tabs/Settings';

// Vouchers tab just redirects to VoucherEntry stack screen
import VouchersTab from '../screens/tabs/VouchersTab';

const Tab = createBottomTabNavigator();

function TabIcon({ name, focused, label }) {
  return (
    <View style={styles.tabIcon}>
      <Icon name={name} size={22} color={focused ? COLORS.primaryLight : '#8b8fa8'} />
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export default function TabNavigator() {
  const { t, isUrdu } = useLang();

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle:           styles.tabBar,
        tabBarActiveTintColor: COLORS.navActive,
        tabBarShowLabel:       false,
        headerShown:           false,
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={Dashboard}
        options={{
          title: t.dashboard,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="grid-outline" focused={focused} label={t.dashboard} />
          ),
        }}
      />
      <Tab.Screen
        name="Reports"
        component={Reports}
        options={{
          title: t.reports,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="bar-chart-outline" focused={focused} label={t.reports} />
          ),
        }}
      />
      <Tab.Screen
        name="Vouchers"
        component={VouchersTab}
        options={{
          title: t.voucherEntry,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="document-text-outline" focused={focused} label={isUrdu ? 'ووچر' : 'Vouchers'} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={Settings}
        options={{
          title: t.settings,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="settings-outline" focused={focused} label={t.settings} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.navBg,
    borderWidth:     1,
    borderColor:     COLORS.glassBorder,
    borderRadius:    32,
    height:          68,
    marginHorizontal: 16,
    marginBottom:    12,
    paddingBottom:   8,
    paddingTop:      7,
    position:        'absolute',
    left:            0,
    right:           0,
    shadowColor:     '#1769E0',
    shadowOpacity:   0.14,
    shadowRadius:    18,
    shadowOffset:    { width: 0, height: 8 },
    elevation:       8,
  },
  tabIcon:       { alignItems: 'center', justifyContent: 'center', paddingTop: 4, minWidth: 62 },
  tabLabel:      { fontSize: 10, color: COLORS.textMuted, marginTop: 3, textAlign: 'center' },
  tabLabelActive: { color: COLORS.primary, fontWeight: '700' },
});
