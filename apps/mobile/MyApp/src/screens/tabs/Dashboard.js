/**
 * Dashboard Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  RefreshControl, Dimensions, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { Card, StatCard, EmptyState, Toast, ScrollHeader } from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';
import { getBalanceSheet, getProfitLoss } from '../../services/sqliteService';
import { PKR } from '../../utils/accountingEngine';

const { width } = Dimensions.get('window');

export default function Dashboard() {
  const { t, isUrdu } = useLang();
  const navigation = useNavigation();
  const {
    currentDb, dbInfo, companyInfo, notification,
    loadDatabases, selectDatabase, showNotification,
  } = useDatabase();

  const [stats,      setStats]      = useState({ totalAssets: 0, totalLiab: 0, netIncome: 0, totalIncome: 0, totalExpenses: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [chartData,  setChartData]  = useState(null);
  const scrollY = React.useRef(new Animated.Value(0)).current;

  const loadStats = useCallback(async () => {
    if (!currentDb) return;
    try {
      const bs = await getBalanceSheet(currentDb, {});
      const pl = await getProfitLoss(currentDb, {});
      if (bs.success) {
        setStats(prev => ({ ...prev, totalAssets: bs.data.totalAssets || 0, totalLiab: bs.data.totalLiab || 0 }));
      }
      if (pl.success) {
        setStats(prev => ({
          ...prev,
          netIncome:     pl.data.netProfitLoss  || 0,
          totalIncome:   pl.data.totalIncome    || 0,
          totalExpenses: pl.data.totalExpenses  || 0,
        }));
        const incGroups = pl.data.income   || [];
        const expGroups = pl.data.expenses || [];
        const labels    = [
          ...incGroups.slice(0, 3).map(g => (g.headName || '').slice(0, 8)),
          ...expGroups.slice(0, 3).map(g => (g.headName || '').slice(0, 8)),
        ];
        if (labels.length > 0) {
          setChartData({
            labels: labels.length > 0 ? labels : ['No Data'],
            datasets: [{
              data: [
                ...incGroups.slice(0, 3).map(g => Math.abs(g.total || 0)),
                ...expGroups.slice(0, 3).map(g => Math.abs(g.total || 0)),
              ] || [0],
            }],
          });
        }
      }
    } catch (_) {}
  }, [currentDb]);

  useEffect(() => { loadStats(); }, [loadStats, dbInfo?.lastRefresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDatabases();
    loadStats();
    setRefreshing(false);
  }, [loadDatabases, loadStats]);

  const dbName = currentDb ? currentDb.replace('.sqlite', '') : null;

  return (
    <View style={styles.container}>
      <Toast notification={notification} />

      {/* Header */}
      <ScrollHeader scrollY={scrollY}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{companyInfo?.CompanyName || t.appName}</Text>
          {companyInfo?.UCompanyName ? <Text style={styles.headerUrdu}>{companyInfo.UCompanyName}</Text> : null}
          {dbName ? <Text style={styles.headerDb}>📂 {dbName}</Text> : null}
        </View>
       
      </View>
      </ScrollHeader>
       <TouchableOpacity style={styles.dbBtn} onPress={() => navigation.navigate('DatabaseSelector')}>
          <Icon name="layers-outline" size={20} color="#fff" />
          <Text style={styles.dbBtnText}>{t.databases}</Text>
        </TouchableOpacity>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {!currentDb ? (
          <EmptyState
            title={t.noDatabaseSelected}
            subtitle={t.selectDbFirst}
            icon={<Icon name="server-outline" size={48} color={COLORS.textLight} />}
          />
        ) : (
          <>
            {/* Summary Stats */}
            <Text style={styles.sectionLabel}>{isUrdu ? 'مالی خلاصہ' : 'Financial Overview'}</Text>
            <View style={styles.statsRow}>
              <StatCard
                label={t.totalAssets}
                value={PKR(stats.totalAssets)}
                color={COLORS.dr}
                icon={<Icon name="trending-up" size={18} color={COLORS.dr} />}
                onPress={() => navigation.navigate('BalanceSheet')}
              />
              <View style={{ width: 8 }} />
              <StatCard
                label={t.liabilities}
                value={PKR(stats.totalLiab)}
                color={COLORS.cr}
                icon={<Icon name="trending-down" size={18} color={COLORS.cr} />}
                onPress={() => navigation.navigate('BalanceSheet')}
              />
            </View>
            <View style={[styles.statsRow, { marginTop: 8 }]}>
              <StatCard
                label={t.totalIncome}
                value={PKR(stats.totalIncome)}
                color={COLORS.success}
                icon={<Icon name="cash-outline" size={18} color={COLORS.success} />}
                onPress={() => navigation.navigate('ProfitLoss')}
              />
              <View style={{ width: 8 }} />
              <StatCard
                label={stats.netIncome >= 0 ? t.netProfit : t.netLoss}
                value={PKR(Math.abs(stats.netIncome))}
                color={stats.netIncome >= 0 ? COLORS.success : COLORS.danger}
                icon={<Icon name={stats.netIncome >= 0 ? 'arrow-up-circle-outline' : 'arrow-down-circle-outline'} size={18} color={stats.netIncome >= 0 ? COLORS.success : COLORS.danger} />}
                onPress={() => navigation.navigate('ProfitLoss')}
              />
            </View>

            {/* Chart */}
            {chartData && chartData.labels.length > 0 && (
              <Card style={{ marginTop: 12, padding: 10 }}>
                <Text style={styles.chartTitle}>{isUrdu ? 'آمدنی بمقابلہ اخراجات' : 'Income vs Expenses'}</Text>
                <View style={styles.chartFrame}>
                  {chartData.labels.map((label, index) => {
                    const value = chartData.datasets[0].data[index] || 0;
                    const maxValue = Math.max(...chartData.datasets[0].data, 1);
                    return (
                      <View key={`${label}-${index}`} style={styles.chartColumn}>
                        <View style={[styles.chartBar, { height: Math.max(4, (value / maxValue) * 112) }]} />
                        <Text style={styles.chartLabel} numberOfLines={1}>{label}</Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
            )}

            {/* Quick Actions */}
            <Text style={styles.sectionLabel}>{isUrdu ? 'فوری اقدامات' : 'Quick Actions'}</Text>
            <View style={styles.actionGrid}>
              {[
                { icon: 'scale-outline',        label: t.trialBalance,     screen: 'TrialBalance' },
                { icon: 'document-text-outline', label: t.balanceSheet,    screen: 'BalanceSheet' },
                { icon: 'trending-up-outline',   label: t.profitLoss,      screen: 'ProfitLoss' },
                { icon: 'book-outline',          label: t.accountStatement, screen: 'AccountStatement' },
                { icon: 'receipt-outline',       label: t.voucherEntry,    screen: 'VoucherEntry' },
                { icon: 'people-outline',        label: t.accountManager,  screen: 'AccountManager' },
              ].map(a => (
                <TouchableOpacity
                  key={a.screen}
                  style={styles.actionCard}
                  onPress={() => navigation.navigate(a.screen)}
                  activeOpacity={0.8}
                >
                  <View style={styles.actionIcon}>
                    <Icon name={a.icon} size={22} color={COLORS.primary} />
                  </View>
                  <Text style={styles.actionLabel} numberOfLines={2}>{a.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* DB Info */}
            <Card style={{ marginTop: 4 }}>
              <Text style={styles.dbInfoLabel}>{isUrdu ? 'ڈیٹا بیس معلومات' : 'Database Info'}</Text>
              <View style={styles.dbInfoRow}>
                <Icon name="server-outline" size={14} color={COLORS.primary} />
                <Text style={styles.dbInfoText}>{currentDb}</Text>
              </View>
              <View style={styles.dbInfoRow}>
                <Icon name="refresh-circle-outline" size={14} color={COLORS.success} />
                <Text style={styles.dbInfoText}>
                  {isUrdu ? 'آخری تازہ کاری:' : 'Last refresh:'}{' '}
                  {dbInfo?.lastRefresh ? new Date(dbInfo.lastRefresh).toLocaleTimeString() : '—'}
                </Text>
              </View>
            </Card>
          </>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  header:       { backgroundColor: COLORS.bg, paddingTop: 50, paddingBottom: 18, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border},
  headerTitle:  { color: COLORS.text, fontSize: FONTS.size.xl, fontWeight: '800',textAlign:'center' },
  headerUrdu:   { color: COLORS.primary, fontSize: FONTS.size.lg, marginTop: 2,textAlign:'center' },
  headerDb:     { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 6,textAlign:'center' },
  dbBtn:        {  backgroundColor: '#004ef7ea',borderColor: COLORS.glassBorder, borderRadius: RADIUS.xl, paddingVertical: 9, paddingHorizontal: 13, gap: 6, ...SHADOW.sm,marginTop: 20, marginHorizontal: 20, marginBottom: 0.5,allignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  dbBtnText:    { color: '#fff', fontSize: FONTS.size.sm, fontWeight: '700' },
  scroll:       { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: FONTS.size.sm, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 12 },
  statsRow:     { flexDirection: 'row' },
  chartTitle:   { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  chartFrame:   { height: 142, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingTop: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  chartColumn:  { flex: 1, alignItems: 'center', justifyContent: 'flex-end', marginHorizontal: 3 },
  chartBar:     { width: '70%', minWidth: 8, maxWidth: 28, backgroundColor: COLORS.primary, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  chartLabel:   { color: COLORS.textMuted, fontSize: 9, marginTop: 5, maxWidth: 42, textAlign: 'center' },
  actionGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  actionCard:   { width: '31%', backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, alignItems: 'center', ...SHADOW.sm },
  actionIcon:   { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionLabel:  { fontSize: FONTS.size.xs, color: COLORS.text, fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  dbInfoLabel:  { fontSize: FONTS.size.sm, fontWeight: '700', color: COLORS.textMuted, marginBottom: 8 },
  dbInfoRow:    { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  dbInfoText:   { fontSize: FONTS.size.xs, color: COLORS.textMuted, flex: 1 },
});
