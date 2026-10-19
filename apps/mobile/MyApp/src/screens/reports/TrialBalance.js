/**
 * Trial Balance Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { getTrialBalance } from '../../services/sqliteService';
import { printTrialBalance } from '../../utils/pdfGenerator';
import { PKR } from '../../utils/accountingEngine';
import {
  PageHeader, FilterBar, PrimaryButton, EmptyState,
  TableRow, Toast, Card, LoadingOverlay,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS } from '../../components/theme';

export default function TrialBalance() {
  const { t, isUrdu } = useLang();
  const { currentDb, companyInfo, notification, prefs } = useDatabase();

  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [printing,  setPrinting]  = useState(false);
  const [viewMode,  setViewMode]  = useState('grouped');

  const loadData = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const result = await getTrialBalance(currentDb, { endDate: endDate || undefined });
      if (result.success) setData(result.data);
    } catch (_) {}
    setLoading(false);
  }, [currentDb, endDate]);

  useEffect(() => { if (currentDb) loadData(); }, [currentDb]);

  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      await printTrialBalance({
        rows: data.rows, groups: data.groups,
        totalDebit: data.totalDebit, totalCredit: data.totalCredit,
        difference: data.difference,
        title:       t.trialBalanceTitle,
        subtitle:    endDate ? `${isUrdu ? 'بتاریخ:' : 'As of:'} ${endDate}` : undefined,
        companyName: companyInfo?.CompanyName || t.appName,
        isUrdu, generatedAt: new Date().toLocaleString(),
        logoData: prefs.logoData,
        defaultFileName: `TrialBalance_${endDate || 'all'}.pdf`,
      });
    } catch (e) { console.warn(e); }
    setPrinting(false);
  };

  const isEmpty = data && (data.rows || []).length === 0;

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <LoadingOverlay visible={printing} message={isUrdu ? 'پی ڈی ایف بن رہی ہے…' : 'Generating PDF…'} />

      <PageHeader
        title={t.trialBalanceTitle}
        subtitle={t.trialBalanceSubtitle}
        isUrdu={isUrdu}
        right={
          <PrimaryButton
            title={isUrdu ? 'پی ڈی ایف' : 'PDF'}
            onPress={handlePrint}
            disabled={!data || isEmpty}
            small
            icon={<Icon name="document-outline" size={14} color="#fff" />}
          />
        }
      />

      <FilterBar style={{ marginHorizontal: 16 }}>
        <TextInput style={styles.dateInput} value={startDate} onChangeText={setStartDate}
          placeholder={isUrdu ? 'شروع (YYYY-MM-DD)' : 'Start date'} placeholderTextColor={COLORS.textLight} />
        <TextInput style={styles.dateInput} value={endDate} onChangeText={setEndDate}
          placeholder={isUrdu ? 'آخر (YYYY-MM-DD)' : 'End date'} placeholderTextColor={COLORS.textLight} />
        <TouchableOpacity style={styles.applyBtn} onPress={loadData}>
          <Icon name="search-outline" size={16} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.modeBtn} onPress={() => setViewMode(v => v === 'flat' ? 'grouped' : 'flat')}>
          <Icon name={viewMode === 'grouped' ? 'list-outline' : 'layers-outline'} size={16} color={COLORS.primary} />
        </TouchableOpacity>
      </FilterBar>

      {!currentDb ? (
        <EmptyState title={t.noDatabaseSelected} subtitle={t.selectDbFirst}
          icon={<Icon name="scale-outline" size={48} color={COLORS.textLight} />} />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : isEmpty ? (
        <EmptyState title={t.noData} icon={<Icon name="scale-outline" size={48} color={COLORS.textLight} />} />
      ) : data ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t.totalDebit}</Text>
              <Text style={[styles.summaryValue, { color: COLORS.debit }]}>{PKR(data.totalDebit)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{t.totalCredit}</Text>
              <Text style={[styles.summaryValue, { color: COLORS.credit }]}>{PKR(data.totalCredit)}</Text>
            </View>
            <View style={[styles.summaryRow, { borderTopWidth: 1.5, borderTopColor: COLORS.primary, paddingTop: 6, marginTop: 4 }]}>
              <Text style={[styles.summaryLabel, { color: COLORS.primary, fontWeight: '700' }]}>{t.difference}</Text>
              <Text style={[styles.summaryValue, { color: COLORS.primary }]}>
                {data.difference === 0 ? t.balanced : PKR(Math.abs(data.difference))}
              </Text>
            </View>
          </Card>

          <TableRow isHeader cells={[
            { text: t.acNo, width: 44 },
            { text: t.accountName, flex: 2 },
            { text: t.debit,  flex: 1, align: 'right' },
            { text: t.credit, flex: 1, align: 'right' },
          ]} />

          {viewMode === 'grouped' && (data.groups || []).map((group, gi) => (
            <View key={gi}>
              <TableRow isGroup cells={[
                { text: isUrdu ? (group.subNameU || group.subName || '') : (group.subName || 'Unclassified'), flex: 3 },
                { text: PKR(group.groupDebit),  flex: 1, align: 'right' },
                { text: PKR(group.groupCredit), flex: 1, align: 'right' },
              ]} />
              {(group.rows || []).map((row, ri) => (
                <TableRow key={ri} cells={[
                  { text: String(row.accountId), width: 44, color: COLORS.textMuted },
                  { text: isUrdu ? (row.accountNameUr || row.accountName) : row.accountName, flex: 2 },
                  { text: PKR(row.debit),  flex: 1, align: 'right', color: row.debit  ? COLORS.debit  : COLORS.textLight },
                  { text: PKR(row.credit), flex: 1, align: 'right', color: row.credit ? COLORS.credit : COLORS.textLight },
                ]} />
              ))}
            </View>
          ))}

          {viewMode === 'flat' && (data.rows || []).map((row, i) => (
            <TableRow key={i} cells={[
              { text: String(row.accountId), width: 44, color: COLORS.textMuted },
              { text: isUrdu ? (row.accountNameUr || row.accountName) : row.accountName, flex: 2 },
              { text: PKR(row.debit),  flex: 1, align: 'right', color: row.debit  ? COLORS.debit  : COLORS.textLight },
              { text: PKR(row.credit), flex: 1, align: 'right', color: row.credit ? COLORS.credit : COLORS.textLight },
            ]} />
          ))}

          <TableRow isGrand cells={[
            { text: '', width: 44 },
            { text: isUrdu ? 'کل' : 'TOTAL', flex: 2 },
            { text: PKR(data.totalDebit),  flex: 1, align: 'right' },
            { text: PKR(data.totalCredit), flex: 1, align: 'right' },
          ]} />
          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:       { paddingHorizontal: 16, paddingBottom: 40 },
  dateInput:    { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: FONTS.size.sm, color: COLORS.text, backgroundColor: '#fff', minWidth: 100 },
  applyBtn:     { backgroundColor: COLORS.primary, padding: 9, borderRadius: RADIUS.sm },
  modeBtn:      { backgroundColor: '#fff', padding: 9, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border },
  summaryCard:  { marginBottom: 10 },
  summaryRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  summaryLabel: { fontSize: FONTS.size.sm, color: COLORS.textMuted },
  summaryValue: { fontSize: FONTS.size.sm, fontWeight: '700' },
});
