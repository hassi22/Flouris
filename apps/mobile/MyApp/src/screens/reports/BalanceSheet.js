/**
 * Balance Sheet Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { getBalanceSheet } from '../../services/sqliteService';
import { printBalanceSheet } from '../../utils/pdfGenerator';
import { PKR } from '../../utils/accountingEngine';
import {
  PageHeader, FilterBar, PrimaryButton, EmptyState,
  TableRow, Toast, Card, LoadingOverlay,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS } from '../../components/theme';

function GroupSection({ groups, isUrdu }) {
  return (groups || []).map((g, gi) => {
    const label = isUrdu && g.subNameU ? g.subNameU : g.subName;
    return (
      <View key={gi}>
        <TableRow isGroup cells={[
          { text: label || (isUrdu ? 'غیر درجہ بند' : 'Unclassified'), flex: 2 },
          { text: '', flex: 1 },
        ]} />
        {(g.accounts || []).map((a, ai) => (
          <TableRow key={ai} cells={[
            { text: isUrdu ? (a.accountNameUr || a.accountName) : a.accountName, flex: 2, style: { paddingLeft: 14 } },
            { text: PKR(Math.abs(a.balance)), flex: 1, align: 'right' },
          ]} />
        ))}
        <TableRow isSub cells={[
          { text: `${label || ''} ${isUrdu ? 'ذیلی کل' : 'Subtotal'}`, flex: 2 },
          { text: PKR(Math.abs(g.total)), flex: 1, align: 'right' },
        ]} />
      </View>
    );
  });
}

export default function BalanceSheet() {
  const { t, isUrdu } = useLang();
  const { currentDb, companyInfo, notification, prefs } = useDatabase();

  const [asOfDate, setAsOfDate] = useState('');
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [printing, setPrinting] = useState(false);

  const loadData = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const result = await getBalanceSheet(currentDb, { asOfDate: asOfDate || undefined });
      if (result.success) setData(result.data);
    } catch (_) {}
    setLoading(false);
  }, [currentDb, asOfDate]);

  useEffect(() => { if (currentDb) loadData(); }, [currentDb]);

  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      await printBalanceSheet({
        assets: data.assets, liabilities: data.liabilities, equity: data.equity,
        totalAssets: data.totalAssets, totalLE: data.totalLE, balanceDiff: data.balanceDiff,
        title:       t.balanceSheetTitle,
        subtitle:    asOfDate ? `${isUrdu ? 'بتاریخ:' : 'As of:'} ${asOfDate}` : undefined,
        companyName: companyInfo?.CompanyName || t.appName,
        isUrdu, generatedAt: new Date().toLocaleString(),
        logoData: prefs.logoData,
        defaultFileName: `BalanceSheet_${asOfDate || 'all'}.pdf`,
      });
    } catch (e) { console.warn(e); }
    setPrinting(false);
  };

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <LoadingOverlay visible={printing} message={isUrdu ? 'پی ڈی ایف بن رہی ہے…' : 'Generating PDF…'} />

      <PageHeader
        title={t.balanceSheetTitle} subtitle={t.balanceSheetSubtitle} isUrdu={isUrdu}
        right={
          <PrimaryButton title={isUrdu ? 'پی ڈی ایف' : 'PDF'} onPress={handlePrint} disabled={!data} small
            icon={<Icon name="document-outline" size={14} color="#fff" />} />
        }
      />

      <FilterBar style={{ marginHorizontal: 16 }}>
        <TextInput style={styles.dateInput} value={asOfDate} onChangeText={setAsOfDate}
          placeholder={isUrdu ? 'بتاریخ (YYYY-MM-DD)' : 'As of date'} placeholderTextColor={COLORS.textLight} />
        <TouchableOpacity style={styles.applyBtn} onPress={loadData}>
          <Icon name="search-outline" size={16} color="#fff" />
        </TouchableOpacity>
      </FilterBar>

      {!currentDb ? (
        <EmptyState title={t.noDatabaseSelected} subtitle={t.selectDbFirst}
          icon={<Icon name="document-text-outline" size={48} color={COLORS.textLight} />} />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Card style={styles.summaryCard}>
            <View style={styles.row}>
              <Text style={styles.sumLabel}>{t.totalAssets}</Text>
              <Text style={[styles.sumVal, { color: COLORS.dr }]}>{PKR(Math.abs(data.totalAssets))}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.sumLabel}>{t.totalLiabAndEquity}</Text>
              <Text style={[styles.sumVal, { color: COLORS.cr }]}>{PKR(Math.abs(data.totalLE))}</Text>
            </View>
            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 6, marginTop: 4 }]}>
              <Text style={[styles.sumLabel, { color: COLORS.primary, fontWeight: '700' }]}>{t.balanceCheck}</Text>
              <Text style={[styles.sumVal, { color: (data.balanceDiff || 0) < 1 ? COLORS.success : COLORS.danger }]}>
                {(data.balanceDiff || 0) < 1 ? t.balanced : `Diff: ${PKR(data.balanceDiff)}`}
              </Text>
            </View>
          </Card>

          {/* Assets */}
          <View style={styles.sectionHead}>
            <View style={[styles.sectionDot, { backgroundColor: COLORS.dr }]} />
            <Text style={styles.sectionTitle}>{t.assets}</Text>
          </View>
          <TableRow isHeader cells={[
            { text: isUrdu ? 'اکاؤنٹ' : 'Account', flex: 2 },
            { text: isUrdu ? 'رقم' : 'Amount (Rs.)', flex: 1, align: 'right' },
          ]} />
          <GroupSection groups={data.assets} isUrdu={isUrdu} />
          <TableRow isTotal cells={[
            { text: t.totalAssets, flex: 2 },
            { text: PKR(Math.abs(data.totalAssets)), flex: 1, align: 'right' },
          ]} />

          <View style={{ height: 16 }} />

          {/* Liabilities */}
          <View style={styles.sectionHead}>
            <View style={[styles.sectionDot, { backgroundColor: COLORS.cr }]} />
            <Text style={styles.sectionTitle}>{t.liabilities}</Text>
          </View>
          <TableRow isHeader cells={[
            { text: isUrdu ? 'اکاؤنٹ' : 'Account', flex: 2 },
            { text: isUrdu ? 'رقم' : 'Amount (Rs.)', flex: 1, align: 'right' },
          ]} />
          <GroupSection groups={data.liabilities} isUrdu={isUrdu} />

          <View style={{ height: 10 }} />

          {/* Equity */}
          <View style={styles.sectionHead}>
            <View style={[styles.sectionDot, { backgroundColor: '#0f766e' }]} />
            <Text style={styles.sectionTitle}>{t.equityCapital}</Text>
          </View>
          <GroupSection groups={data.equity} isUrdu={isUrdu} />
          <TableRow isTotal cells={[
            { text: t.totalLiabAndEquity, flex: 2 },
            { text: PKR(Math.abs(data.totalLE)), flex: 1, align: 'right' },
          ]} />

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:      { paddingHorizontal: 16, paddingBottom: 40 },
  dateInput:   { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: FONTS.size.sm, color: COLORS.text, backgroundColor: '#fff' },
  applyBtn:    { backgroundColor: COLORS.primary, padding: 9, borderRadius: RADIUS.sm },
  summaryCard: { marginBottom: 10 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  sumLabel:    { fontSize: FONTS.size.sm, color: COLORS.textMuted },
  sumVal:      { fontSize: FONTS.size.sm, fontWeight: '700' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8, marginTop: 4 },
  sectionDot:  { width: 10, height: 10, borderRadius: 5 },
  sectionTitle: { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text },
});
