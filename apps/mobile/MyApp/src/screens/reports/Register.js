/**
 * Register / Operational Report Screen — Flouris ERP Mobile (bare RN)
 * Covers: Sales, Purchase, Cash Book, Receipts, Payments, Income/Expense,
 *         Voucher Register, Stock, Salary, Production, Bardana, Party Balances
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { getOperationalReport, getTrialBalance } from '../../services/sqliteService';
import { printRegister } from '../../utils/pdfGenerator';
import { PKR } from '../../utils/accountingEngine';
import {
  PageHeader, FilterBar, PrimaryButton, EmptyState,
  TableRow, Toast, Card, LoadingOverlay,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS } from '../../components/theme';

export default function Register() {
  const { t, isUrdu } = useLang();
  const { currentDb, companyInfo, notification, prefs } = useDatabase();
  const route      = useRoute();
  const navigation = useNavigation();

  const reportId  = route.params?.reportId   || 'voucher-register';
  const codesStr  = route.params?.codes      || '';
  const titleEn   = route.params?.title      || 'Register';
  const titleUr   = route.params?.titleUr    || 'رجسٹر';
  const balMode   = route.params?.balanceMode === true || route.params?.balanceMode === 'true';

  const codes = codesStr ? codesStr.split(',').map(Number) : [];
  const title = isUrdu ? titleUr : titleEn;

  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [printing,  setPrinting]  = useState(false);
  const [total,     setTotal]     = useState(0);

  // Update header title dynamically
  useEffect(() => { navigation.setOptions({ title }); }, [title]);

  const loadData = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      if (balMode) {
        const result = await getTrialBalance(currentDb, { endDate: endDate || undefined });
        if (result.success) {
          const flatRows = result.data.rows || [];
          setRows(flatRows.map(r => ({
            group:   r.subName || r.headName || '',
            party:   isUrdu ? (r.accountNameUr || r.accountName) : r.accountName,
            partyUr: r.accountNameUr || r.accountName,
            debit:   r.debit,
            credit:  r.credit,
            balance: r.debit - r.credit,
          })));
          setTotal(flatRows.reduce((s, r) => s + Math.abs(r.debit - r.credit), 0));
        }
      } else {
        const result = await getOperationalReport(currentDb, {
          startDate: startDate || undefined,
          endDate:   endDate   || undefined,
          codes:     codes.length ? codes : undefined,
          reportId,
        });
        if (result.success) {
          const enriched = result.data.rows || [];
          setRows(enriched);
          setTotal(enriched.reduce((s, r) => s + Math.abs(r.Amount || 0), 0));
        }
      }
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, [currentDb, startDate, endDate, balMode, reportId, codesStr]);

  useEffect(() => { if (currentDb) loadData(); }, [currentDb]);

  const handlePrint = async () => {
    if (!rows.length) return;
    setPrinting(true);
    try {
      await printRegister({
        rows, title: isUrdu ? titleUr : titleEn,
        subtitle:    (startDate || endDate) ? `${startDate || ''} — ${endDate || ''}` : undefined,
        companyName: companyInfo?.CompanyName || t.appName,
        isUrdu, generatedAt: new Date().toLocaleString(),
        logoData: prefs.logoData, total, balanceMode: balMode,
        totalDebit:  rows.reduce((s, r) => s + (r.debit  || 0), 0),
        totalCredit: rows.reduce((s, r) => s + (r.credit || 0), 0),
        defaultFileName: `${reportId}_${endDate || 'all'}.pdf`,
      });
    } catch (e) { console.warn(e); }
    setPrinting(false);
  };

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <LoadingOverlay visible={printing} message={isUrdu ? 'پی ڈی ایف بن رہی ہے…' : 'Generating PDF…'} />

      <PageHeader title={title} isUrdu={isUrdu}
        right={
          <PrimaryButton title={isUrdu ? 'پی ڈی ایف' : 'PDF'} onPress={handlePrint} disabled={!rows.length} small
            icon={<Icon name="document-outline" size={14} color="#fff" />} />
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
      </FilterBar>

      {!currentDb ? (
        <EmptyState title={t.noDatabaseSelected} subtitle={t.selectDbFirst}
          icon={<Icon name="list-outline" size={48} color={COLORS.textLight} />} />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {rows.length > 0 && (
            <Card style={styles.summaryCard}>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>{isUrdu ? 'کل اندراجات' : 'Total Entries'}</Text>
                <Text style={styles.sumVal}>{rows.length}</Text>
              </View>
              <View style={styles.sumRow}>
                <Text style={styles.sumLabel}>{isUrdu ? 'کل رقم' : 'Total Amount'}</Text>
                <Text style={[styles.sumVal, { color: COLORS.primary }]}>{PKR(total)}</Text>
              </View>
            </Card>
          )}

          {balMode ? (
            <>
              <TableRow isHeader cells={[
                { text: isUrdu ? 'گروپ'   : 'Group',   flex: 1 },
                { text: isUrdu ? 'اکاؤنٹ' : 'Account', flex: 2 },
                { text: isUrdu ? 'ڈیبٹ'   : 'Debit',   flex: 1, align: 'right' },
                { text: isUrdu ? 'کریڈٹ'  : 'Credit',  flex: 1, align: 'right' },
                { text: isUrdu ? 'بیلنس'  : 'Balance', flex: 1, align: 'right' },
              ]} />
              {rows.map((row, i) => (
                <TableRow key={i} cells={[
                  { text: row.group || '', flex: 1, color: COLORS.textMuted },
                  { text: isUrdu ? (row.partyUr || row.party) : row.party, flex: 2 },
                  { text: PKR(row.debit),             flex: 1, align: 'right', color: row.debit   ? COLORS.dr : COLORS.textLight },
                  { text: PKR(row.credit),            flex: 1, align: 'right', color: row.credit  ? COLORS.cr : COLORS.textLight },
                  { text: PKR(Math.abs(row.balance)), flex: 1, align: 'right', color: row.balance >= 0 ? COLORS.dr : COLORS.cr },
                ]} />
              ))}
            </>
          ) : (
            <>
              <TableRow isHeader cells={[
                { text: isUrdu ? 'تاریخ' : 'Date',     width: 74 },
                { text: isUrdu ? 'قسم'   : 'Type',     width: 60 },
                { text: isUrdu ? 'پارٹی' : 'Party',    flex: 2 },
                { text: isUrdu ? 'تفصیل' : 'Narration', flex: 2 },
                { text: isUrdu ? 'رقم'   : 'Amount',   flex: 1, align: 'right' },
              ]} />
              {rows.length === 0 && (
                <EmptyState title={t.noData}
                  icon={<Icon name="document-outline" size={32} color={COLORS.textLight} />} />
              )}
              {rows.map((row, i) => (
                <TableRow key={i} cells={[
                  { text: row.TR_Date ? new Date(row.TR_Date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '', width: 74, color: COLORS.textMuted },
                  { text: isUrdu ? (row.vtypeNameUr || row.vtypeName || '') : (row.vtypeName || ''), width: 60, color: COLORS.textMuted },
                  { text: isUrdu ? (row.partyNameUr || row.partyName || '') : (row.partyName || ''), flex: 2 },
                  { text: row.Narration || row.Remarks || '', flex: 2, color: COLORS.textMuted, lines: 2 },
                  { text: PKR(row.Amount), flex: 1, align: 'right', color: COLORS.primary },
                ]} />
              ))}
              {rows.length > 0 && (
                <TableRow isGrand cells={[
                  { text: '', width: 74 }, { text: '', width: 60 }, { text: '', flex: 2 },
                  { text: isUrdu ? 'کل' : 'Total', flex: 2 },
                  { text: PKR(total), flex: 1, align: 'right' },
                ]} />
              )}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:      { paddingHorizontal: 16, paddingBottom: 40 },
  dateInput:   { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: FONTS.size.sm, color: COLORS.text, backgroundColor: '#fff', minWidth: 90 },
  applyBtn:    { backgroundColor: COLORS.primary, padding: 9, borderRadius: RADIUS.sm },
  summaryCard: { marginBottom: 10 },
  sumRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  sumLabel:    { fontSize: FONTS.size.sm, color: COLORS.textMuted },
  sumVal:      { fontSize: FONTS.size.sm, fontWeight: '700', color: COLORS.text },
});
