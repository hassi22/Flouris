/**
 * Profit & Loss Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { getProfitLoss } from '../../services/sqliteService';
import { printProfitLoss } from '../../utils/pdfGenerator';
import { PKR } from '../../utils/accountingEngine';
import {
  PageHeader, FilterBar, PrimaryButton, EmptyState,
  TableRow, Toast, Card, LoadingOverlay,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS } from '../../components/theme';

export default function ProfitLoss() {
  const { t, isUrdu } = useLang();
  const { currentDb, companyInfo, notification, prefs } = useDatabase();

  const [startDate, setStartDate] = useState('');
  const [endDate,   setEndDate]   = useState('');
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [printing,  setPrinting]  = useState(false);

  const loadData = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const result = await getProfitLoss(currentDb, {
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
      });
      if (result.success) setData(result.data);
    } catch (_) {}
    setLoading(false);
  }, [currentDb, startDate, endDate]);

  useEffect(() => { if (currentDb) loadData(); }, [currentDb]);

  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      await printProfitLoss({
        income: data.income, expenses: data.expenses,
        totalIncome: data.totalIncome, totalExpenses: data.totalExpenses,
        netProfitLoss: data.netProfitLoss,
        title:       t.profitLossTitle,
        subtitle:    (startDate || endDate) ? `${startDate || ''} — ${endDate || ''}` : undefined,
        companyName: companyInfo?.CompanyName || t.appName,
        isUrdu, generatedAt: new Date().toLocaleString(),
        logoData: prefs.logoData,
        defaultFileName: `ProfitLoss_${endDate || 'all'}.pdf`,
      });
    } catch (e) { console.warn(e); }
    setPrinting(false);
  };

  const isProfit = data && data.netProfitLoss >= 0;

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <LoadingOverlay visible={printing} message={isUrdu ? 'پی ڈی ایف بن رہی ہے…' : 'Generating PDF…'} />

      <PageHeader
        title={t.profitLossTitle} subtitle={t.profitLossSubtitle} isUrdu={isUrdu}
        right={
          <PrimaryButton title={isUrdu ? 'پی ڈی ایف' : 'PDF'} onPress={handlePrint} disabled={!data} small
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
          icon={<Icon name="trending-up-outline" size={48} color={COLORS.textLight} />} />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Card style={styles.summaryCard}>
            <View style={styles.row}>
              <Text style={styles.sumLabel}>{t.totalIncome}</Text>
              <Text style={[styles.sumVal, { color: COLORS.credit }]}>{PKR(data.totalIncome)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.sumLabel}>{t.totalExpenses}</Text>
              <Text style={[styles.sumVal, { color: COLORS.warning }]}>{PKR(data.totalExpenses)}</Text>
            </View>
            <View style={[styles.row, { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4, paddingTop: 6 }]}>
              <Text style={[styles.sumLabel, { fontWeight: '700', color: isProfit ? COLORS.success : COLORS.danger }]}>
                {isProfit ? t.netProfit : t.netLoss}
              </Text>
              <Text style={[styles.sumVal, { color: isProfit ? COLORS.success : COLORS.danger }]}>
                {PKR(Math.abs(data.netProfitLoss))}
              </Text>
            </View>
          </Card>

          {/* Income */}
          <View style={styles.sectionHead}>
            <Icon name="arrow-up-circle" size={16} color={COLORS.credit} />
            <Text style={[styles.sectionTitle, { color: COLORS.credit }]}>{t.incomeRevenue}</Text>
          </View>
          <TableRow isHeader cells={[
            { text: isUrdu ? 'اکاؤنٹ' : 'Account', flex: 2 },
            { text: isUrdu ? 'رقم (روپے)' : 'Amount (Rs.)', flex: 1, align: 'right' },
          ]} />
          {(data.income || []).map((g, gi) => (
            <View key={gi}>
              <TableRow isGroup cells={[{ text: g.headName, flex: 2 }, { text: PKR(g.total), flex: 1, align: 'right' }]} />
              {(g.accounts || []).map((a, ai) => (
                <TableRow key={ai} cells={[
                  { text: isUrdu ? (a.accountNameUr || a.accountName) : a.accountName, flex: 2, style: { paddingLeft: 14 } },
                  { text: PKR(a.amount), flex: 1, align: 'right', color: COLORS.credit },
                ]} />
              ))}
              <TableRow isSub cells={[
                { text: `${g.headName} ${isUrdu ? 'ذیلی کل' : 'Subtotal'}`, flex: 2 },
                { text: PKR(g.total), flex: 1, align: 'right' },
              ]} />
            </View>
          ))}
          <TableRow isTotal cells={[
            { text: t.totalIncome, flex: 2 },
            { text: PKR(data.totalIncome), flex: 1, align: 'right', color: COLORS.credit },
          ]} />

          <View style={{ height: 16 }} />

          {/* Expenses */}
          <View style={styles.sectionHead}>
            <Icon name="arrow-down-circle" size={16} color={COLORS.warning} />
            <Text style={[styles.sectionTitle, { color: COLORS.warning }]}>{t.expenses}</Text>
          </View>
          <TableRow isHeader cells={[
            { text: isUrdu ? 'اکاؤنٹ' : 'Account', flex: 2 },
            { text: isUrdu ? 'رقم (روپے)' : 'Amount (Rs.)', flex: 1, align: 'right' },
          ]} />
          {(data.expenses || []).map((g, gi) => (
            <View key={gi}>
              <TableRow isGroup cells={[{ text: g.headName, flex: 2 }, { text: PKR(g.total), flex: 1, align: 'right' }]} />
              {(g.accounts || []).map((a, ai) => (
                <TableRow key={ai} cells={[
                  { text: isUrdu ? (a.accountNameUr || a.accountName) : a.accountName, flex: 2, style: { paddingLeft: 14 } },
                  { text: PKR(a.amount), flex: 1, align: 'right', color: COLORS.warning },
                ]} />
              ))}
              <TableRow isSub cells={[
                { text: `${g.headName} ${isUrdu ? 'ذیلی کل' : 'Subtotal'}`, flex: 2 },
                { text: PKR(g.total), flex: 1, align: 'right' },
              ]} />
            </View>
          ))}
          <TableRow isTotal cells={[
            { text: t.totalExpenses, flex: 2 },
            { text: PKR(data.totalExpenses), flex: 1, align: 'right', color: COLORS.warning },
          ]} />
          <TableRow isGrand cells={[
            { text: isProfit ? t.netProfit : t.netLoss, flex: 2 },
            { text: PKR(Math.abs(data.netProfitLoss)), flex: 1, align: 'right' },
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
  dateInput:    { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: FONTS.size.sm, color: COLORS.text, backgroundColor: '#fff', minWidth: 90 },
  applyBtn:     { backgroundColor: COLORS.primary, padding: 9, borderRadius: RADIUS.sm },
  summaryCard:  { marginBottom: 10 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  sumLabel:     { fontSize: FONTS.size.sm, color: COLORS.textMuted },
  sumVal:       { fontSize: FONTS.size.sm, fontWeight: '700' },
  sectionHead:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8 },
  sectionTitle: { fontSize: FONTS.size.md, fontWeight: '700' },
});
