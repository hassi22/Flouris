/**
 * Reports Hub — Flouris ERP Mobile (bare RN)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { Toast, EmptyState, ScrollHeader } from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

const REPORT_GROUPS = [
  {
    titleEn: 'Financial Statements', titleUr: 'مالی بیانات', icon: 'stats-chart-outline',
    items: [
      { titleEn: 'Trial Balance',     titleUr: 'ٹرائل بیلنس',  icon: 'scale-outline',         screen: 'TrialBalance' },
      { titleEn: 'Balance Sheet',     titleUr: 'بیلنس شیٹ',    icon: 'document-text-outline', screen: 'BalanceSheet' },
      { titleEn: 'Profit & Loss',     titleUr: 'نفع و نقصان',   icon: 'trending-up-outline',   screen: 'ProfitLoss' },
      { titleEn: 'Account Statement', titleUr: 'اکاؤنٹ بیان',   icon: 'book-outline',          screen: 'AccountStatement' },
    ],
  },
  {
    titleEn: 'Sales & Purchase', titleUr: 'فروخت و خرید', icon: 'cart-outline',
    items: [
      { titleEn: 'Sales Register',           titleUr: 'سیل رجسٹر',          icon: 'arrow-up-circle-outline',   screen: 'Register', params: { reportId: 'sales',          codes: '401,402,404', title: 'Sales Register',       titleUr: 'سیل رجسٹر' } },
      { titleEn: 'Purchase Register',        titleUr: 'خرید رجسٹر',         icon: 'arrow-down-circle-outline', screen: 'Register', params: { reportId: 'purchases',      codes: '301,302,304', title: 'Purchase Register',    titleUr: 'خرید رجسٹر' } },
      { titleEn: 'Sales & Purchase Summary', titleUr: 'فروخت و خرید خلاصہ', icon: 'bar-chart-outline',         screen: 'Register', params: { reportId: 'sales-purchases', codes: '301,302,304,401,402,404', title: 'Sales & Purchase', titleUr: 'فروخت و خرید' } },
      { titleEn: 'Daily Report',             titleUr: 'روزانہ رپورٹ',        icon: 'today-outline',             screen: 'Register', params: { reportId: 'daily-report',   title: 'Daily Report',         titleUr: 'روزانہ رپورٹ' } },
    ],
  },
  {
    titleEn: 'Cash, Income & Expense', titleUr: 'نقد، آمدنی و اخراجات', icon: 'cash-outline',
    items: [
      { titleEn: 'Cash Book',       titleUr: 'کیش بک',        icon: 'wallet-outline',        screen: 'Register', params: { reportId: 'cash-book',       codes: '101,102,203,204,207,208,301,401', title: 'Cash Book',       titleUr: 'کیش بک' } },
      { titleEn: 'Receipt Detail',  titleUr: 'وصولی تفصیل',   icon: 'arrow-down-outline',    screen: 'Register', params: { reportId: 'receipts',        codes: '101,203,207',                    title: 'Receipt Detail',  titleUr: 'وصولی تفصیل' } },
      { titleEn: 'Payment Detail',  titleUr: 'ادائیگی تفصیل', icon: 'arrow-up-outline',      screen: 'Register', params: { reportId: 'payments',        codes: '102,204,208',                    title: 'Payment Detail',  titleUr: 'ادائیگی تفصیل' } },
      { titleEn: 'Income Detail',   titleUr: 'آمدنی تفصیل',    icon: 'trending-up-outline',   screen: 'Register', params: { reportId: 'income',          codes: '401,402,404',                    title: 'Income Detail',   titleUr: 'آمدنی تفصیل' } },
      { titleEn: 'Expense Detail',  titleUr: 'اخراجات تفصیل',  icon: 'trending-down-outline', screen: 'Register', params: { reportId: 'expenses',        codes: '301,302,304',                    title: 'Expense Detail',  titleUr: 'اخراجات تفصیل' } },
      { titleEn: 'Monthly Income',  titleUr: 'ماہانہ آمدنی',   icon: 'analytics-outline',     screen: 'Register', params: { reportId: 'monthly-income',  codes: '401,402,404',                    title: 'Monthly Income',  titleUr: 'ماہانہ آمدنی' } },
      { titleEn: 'Monthly Expense', titleUr: 'ماہانہ اخراجات', icon: 'analytics-outline',     screen: 'Register', params: { reportId: 'monthly-expense', codes: '301,302,304',                    title: 'Monthly Expense', titleUr: 'ماہانہ اخراجات' } },
    ],
  },
  {
    titleEn: 'Registers & Stock', titleUr: 'رجسٹر و اسٹاک', icon: 'layers-outline',
    items: [
      { titleEn: 'Voucher Register',    titleUr: 'واؤچر رجسٹر',     icon: 'list-outline',       screen: 'Register', params: { reportId: 'voucher-register',      title: 'Voucher Register',    titleUr: 'واؤچر رجسٹر' } },
      { titleEn: 'Stock Register',      titleUr: 'اسٹاک رجسٹر',     icon: 'cube-outline',       screen: 'Register', params: { reportId: 'stock-register',        codes: '301,302,304,401,402,404', title: 'Stock Register', titleUr: 'اسٹاک رجسٹر' } },
      { titleEn: 'Salary Reports',      titleUr: 'تنخواہ رپورٹس',    icon: 'people-outline',     screen: 'Register', params: { reportId: 'salary',                title: 'Salary Reports',      titleUr: 'تنخواہ رپورٹس' } },
      { titleEn: 'Production Reports',  titleUr: 'پروڈکشن رپورٹس',   icon: 'construct-outline',  screen: 'Register', params: { reportId: 'production',            title: 'Production Reports',  titleUr: 'پروڈکشن رپورٹس' } },
      { titleEn: 'Bardana Reports',     titleUr: 'بار دانہ رپورٹس',   icon: 'bag-outline',        screen: 'Register', params: { reportId: 'bardana',               title: 'Bardana Reports',     titleUr: 'بار دانہ رپورٹس' } },
    ],
  },
  {
    titleEn: 'Balances & Parties', titleUr: 'بیلنس و پارٹیز', icon: 'people-circle-outline',
    items: [
      { titleEn: 'All Party Balances', titleUr: 'تمام پارٹی بیلنس', icon: 'people-outline',        screen: 'Register', params: { reportId: 'all-party-balances', balanceMode: true, partyRole: 'all',      title: 'All Party Balances', titleUr: 'تمام پارٹی بیلنس' } },
      { titleEn: 'Vendor Balance',     titleUr: 'وینڈر بیلنس',      icon: 'business-outline',      screen: 'Register', params: { reportId: 'vendor-balance',     balanceMode: true, partyRole: 'vendor',   title: 'Vendor Balance',     titleUr: 'وینڈر بیلنس' } },
      { titleEn: 'Customer Balance',   titleUr: 'کسٹمر بیلنس',      icon: 'person-outline',        screen: 'Register', params: { reportId: 'customer-balance',   balanceMode: true, partyRole: 'customer', title: 'Customer Balance',   titleUr: 'کسٹمر بیلنس' } },
      { titleEn: 'Bank Balance',       titleUr: 'بینک بیلنس',        icon: 'card-outline',          screen: 'Register', params: { reportId: 'bank-balance',       balanceMode: true, partyRole: 'bank',     title: 'Bank Balance',       titleUr: 'بینک بیلنس' } },
      { titleEn: 'Staff Balance',      titleUr: 'اسٹاف بیلنس',       icon: 'person-circle-outline', screen: 'Register', params: { reportId: 'staff-balance',      balanceMode: true, partyRole: 'staff',    title: 'Staff Balance',      titleUr: 'اسٹاف بیلنس' } },
    ],
  },
];

export default function ReportsHub() {
  const { t, isUrdu } = useLang();
  const navigation = useNavigation();
  const { currentDb, notification } = useDatabase();
  const scrollY = React.useRef(new Animated.Value(0)).current;

  const navigate = (item) => {
    navigation.navigate(item.screen, item.params || {});
  };

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <ScrollHeader scrollY={scrollY}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t.reports}</Text>
        <Text style={styles.headerSub}>{isUrdu ? 'تمام رپورٹس' : 'All financial & operational reports'}</Text>
      </View>
      </ScrollHeader>

      {!currentDb ? (
        <EmptyState
          title={t.noDatabaseSelected}
          subtitle={t.selectDbFirst}
          icon={<Icon name="bar-chart-outline" size={48} color={COLORS.textLight} />}
        />
      ) : (
        <Animated.ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}>
          {REPORT_GROUPS.map(group => (
            <View key={group.titleEn} style={styles.group}>
              <View style={styles.groupHeader}>
                <Icon name={group.icon} size={16} color={COLORS.primary} />
                <Text style={styles.groupTitle}>{isUrdu ? group.titleUr : group.titleEn}</Text>
              </View>
              <View style={styles.cardGrid}>
                {group.items.map(item => (
                  <TouchableOpacity
                    key={item.titleEn}
                    style={styles.reportCard}
                    onPress={() => navigate(item)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.reportCardIcon}>
                      <Icon name={item.icon} size={20} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.reportCardTitle}>{isUrdu ? item.titleUr : item.titleEn}</Text>
                      <Text style={styles.reportCardSub}>{isUrdu ? 'رپورٹ کھولیں' : 'Open & PDF'}</Text>
                    </View>
                    <Icon name="chevron-forward" size={14} color={COLORS.textLight} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
          <View style={{ height: 40 }} />
        </Animated.ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.bg },
  header:          { backgroundColor: COLORS.bg, paddingTop: 50, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:     { color: COLORS.text, fontSize: FONTS.size.xxl, fontWeight: '800',textAlign: 'center' },
  headerSub:       { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 2,textAlign: 'center' },
  scroll:          { padding: 16 },
  group:           { marginBottom: 16 },
  groupHeader:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  groupTitle:      { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.primary },
  cardGrid:        { gap: 6 },
  reportCard:      { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: RADIUS.lg, paddingVertical: 14, paddingHorizontal: 14, gap: 12, ...SHADOW.sm },
  reportCardIcon:  { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center' },
  reportCardTitle: { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text },
  reportCardSub:   { fontSize: FONTS.size.xs, color: COLORS.textMuted, marginTop: 1 },
});
