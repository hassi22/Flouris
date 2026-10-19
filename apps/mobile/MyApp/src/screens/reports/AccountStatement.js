/**
 * Account Statement Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TextInput, ActivityIndicator,
  TouchableOpacity, Modal, FlatList, Pressable,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { getAccountStatement, getChartOfAccounts } from '../../services/sqliteService';
import { printAccountStatement } from '../../utils/pdfGenerator';
import { PKR } from '../../utils/accountingEngine';
import {
  PageHeader, FilterBar, PrimaryButton, EmptyState,
  TableRow, Toast, Card, LoadingOverlay,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

export default function AccountStatement() {
  const { t, isUrdu } = useLang();
  const { currentDb, companyInfo, notification, prefs, dbInfo } = useDatabase();

  const [accounts,    setAccounts]    = useState([]);
  const [accountId,   setAccountId]   = useState(null);
  const [accountName, setAccountName] = useState('');
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [printing,    setPrinting]    = useState(false);
  const [showPicker,  setShowPicker]  = useState(false);
  const [searchQ,     setSearchQ]     = useState('');

  useEffect(() => {
    if (!currentDb) return;
    getChartOfAccounts(currentDb).then(result => {
      if (result.success) setAccounts(result.data || []);
    });
  }, [currentDb, dbInfo?.lastRefresh]);

  const loadData = useCallback(async () => {
    if (!currentDb || !accountId) return;
    setLoading(true);
    try {
      const result = await getAccountStatement(currentDb, {
        accountId,
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
      });
      if (result.success) setData(result.data);
    } catch (_) {}
    setLoading(false);
  }, [currentDb, accountId, startDate, endDate]);

  const handlePrint = async () => {
    if (!data) return;
    setPrinting(true);
    try {
      await printAccountStatement({
        transactions:   data.transactions,
        accountName:    data.accountName,
        accountNameUr:  data.accountNameUr,
        openingBalance: data.openingBalance,
        closingBalance: data.closingBalance,
        title:          t.accountStatementTitle,
        subtitle:       (startDate || endDate) ? `${startDate || ''} — ${endDate || ''}` : undefined,
        companyName:    companyInfo?.CompanyName || t.appName,
        isUrdu, generatedAt: new Date().toLocaleString(),
        logoData: prefs.logoData,
        defaultFileName: `Statement_AC${accountId}_${endDate || 'all'}.pdf`,
      });
    } catch (e) { console.warn(e); }
    setPrinting(false);
  };

  const filteredAccounts = searchQ
    ? accounts.filter(a =>
        (a.AC_TITLE1 || '').toLowerCase().includes(searchQ.toLowerCase()) ||
        (a.UAC_TITLE || '').includes(searchQ) ||
        String(a.CA).includes(searchQ)
      )
    : accounts;

  const opBal = data?.openingBalance || 0;
  const clBal = data?.closingBalance || 0;
  const drLbl = isUrdu ? 'ڈی آر' : 'Dr';
  const crLbl = isUrdu ? 'سی آر' : 'Cr';

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <LoadingOverlay visible={printing} message={isUrdu ? 'پی ڈی ایف بن رہی ہے…' : 'Generating PDF…'} />

      <PageHeader
        title={t.accountStatementTitle} subtitle={t.accountStatementSubtitle} isUrdu={isUrdu}
        right={
          <PrimaryButton title={isUrdu ? 'پی ڈی ایف' : 'PDF'} onPress={handlePrint} disabled={!data} small
            icon={<Icon name="document-outline" size={14} color="#fff" />} />
        }
      />

      <View style={styles.filterContainer}>
        <TouchableOpacity style={styles.accountPicker} onPress={() => setShowPicker(true)}>
          <Icon name="person-outline" size={16} color={COLORS.primary} />
          <Text style={[styles.accountPickerText, !accountName && { color: COLORS.textLight }]} numberOfLines={1}>
            {accountName || (isUrdu ? t.selectAccount : 'Select Account')}
          </Text>
          <Icon name="chevron-down" size={14} color={COLORS.textLight} />
        </TouchableOpacity>

        <FilterBar style={{ marginTop: 8 }}>
          <TextInput style={styles.dateInput} value={startDate} onChangeText={setStartDate}
            placeholder={isUrdu ? 'شروع' : 'Start date'} placeholderTextColor={COLORS.textLight} />
          <TextInput style={styles.dateInput} value={endDate} onChangeText={setEndDate}
            placeholder={isUrdu ? 'آخر' : 'End date'} placeholderTextColor={COLORS.textLight} />
          <TouchableOpacity style={[styles.loadBtn, !accountId && styles.loadBtnDisabled]}
            onPress={loadData} disabled={!accountId}>
            <Icon name="search-outline" size={16} color="#fff" />
          </TouchableOpacity>
        </FilterBar>
      </View>

      {!currentDb ? (
        <EmptyState title={t.noDatabaseSelected} subtitle={t.selectDbFirst}
          icon={<Icon name="book-outline" size={48} color={COLORS.textLight} />} />
      ) : !accountId ? (
        <EmptyState title={t.selectAccountFirst} subtitle={t.selectAccountHint}
          icon={<Icon name="person-outline" size={48} color={COLORS.textLight} />} />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : data ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Card style={styles.summaryCard}>
            <Text style={styles.accountNameText}>
              {isUrdu ? (data.accountNameUr || data.accountName) : data.accountName}
            </Text>
            <View style={styles.balRow}>
              <View style={styles.balItem}>
                <Text style={styles.balLabel}>{t.openingBalance}</Text>
                <Text style={[styles.balValue, { color: opBal >= 0 ? COLORS.dr : COLORS.cr }]}>
                  {PKR(Math.abs(opBal))} {opBal >= 0 ? drLbl : crLbl}
                </Text>
              </View>
              <View style={styles.balItem}>
                <Text style={styles.balLabel}>{t.closingBalance}</Text>
                <Text style={[styles.balValue, { color: clBal >= 0 ? COLORS.dr : COLORS.cr }]}>
                  {PKR(Math.abs(clBal))} {clBal >= 0 ? drLbl : crLbl}
                </Text>
              </View>
            </View>
          </Card>

          <TableRow isHeader cells={[
            { text: isUrdu ? 'تاریخ' : 'Date',    width: 78 },
            { text: isUrdu ? 'تفصیل' : 'Narration', flex: 2 },
            { text: isUrdu ? 'ڈیبٹ'  : 'Debit',   flex: 1, align: 'right' },
            { text: isUrdu ? 'کریڈٹ' : 'Credit',  flex: 1, align: 'right' },
            { text: isUrdu ? 'بیلنس' : 'Balance', flex: 1, align: 'right' },
          ]} />

          {(data.transactions || []).length === 0 ? (
            <EmptyState title={t.noTransactionsRange}
              icon={<Icon name="document-outline" size={32} color={COLORS.textLight} />} />
          ) : (
            (data.transactions || []).map((tx, i) => {
              const bal = tx.balance || 0;
              return (
                <TableRow key={i} cells={[
                  { text: tx.date ? new Date(tx.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short' }) : '', width: 78, color: COLORS.textMuted },
                  { text: isUrdu ? (tx.narrationUr || tx.narration || '') : (tx.narration || ''), flex: 2, lines: 2 },
                  { text: PKR(tx.debit),  flex: 1, align: 'right', color: tx.debit  ? COLORS.dr : COLORS.textLight },
                  { text: PKR(tx.credit), flex: 1, align: 'right', color: tx.credit ? COLORS.credit : COLORS.textLight },
                  { text: `${PKR(Math.abs(bal))} ${bal >= 0 ? drLbl : crLbl}`, flex: 1, align: 'right', color: bal >= 0 ? COLORS.dr : COLORS.cr },
                ]} />
              );
            })
          )}

          <TableRow isGrand cells={[
            { text: '', width: 78 },
            { text: isUrdu ? 'اختتامی بیلنس' : 'Closing Balance', flex: 2 },
            { text: '', flex: 1 }, { text: '', flex: 1 },
            { text: `${PKR(Math.abs(clBal))} ${clBal >= 0 ? drLbl : crLbl}`, flex: 1, align: 'right' },
          ]} />
          <View style={{ height: 40 }} />
        </ScrollView>
      ) : null}

      {/* Account Picker Modal */}
      <Modal visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isUrdu ? 'اکاؤنٹ منتخب کریں' : 'Select Account'}</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Icon name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalSearch}>
            <Icon name="search-outline" size={16} color={COLORS.textMuted} />
            <TextInput style={styles.modalSearchInput} value={searchQ} onChangeText={setSearchQ}
              placeholder={t.searchAccounts} placeholderTextColor={COLORS.textLight} autoFocus />
          </View>
          <FlatList
            data={filteredAccounts}
            keyExtractor={item => String(item.CA)}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.acPickerItem, item.CA === accountId && styles.acPickerItemActive]}
                onPress={() => {
                  setAccountId(item.CA);
                  setAccountName(isUrdu ? (item.UAC_TITLE || item.AC_TITLE1) : item.AC_TITLE1);
                  setShowPicker(false);
                  setSearchQ('');
                }}
              >
                <Text style={styles.acPickerCode}>{item.CA}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.acPickerName}>{item.AC_TITLE1}</Text>
                  {item.UAC_TITLE ? <Text style={styles.acPickerUr}>{item.UAC_TITLE}</Text> : null}
                </View>
                {item.CA === accountId && <Icon name="checkmark" size={18} color={COLORS.primary} />}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: COLORS.borderLight }} />}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: COLORS.bg },
  center:            { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:            { paddingHorizontal: 16, paddingBottom: 40 },
  filterContainer:   { paddingHorizontal: 16, paddingBottom: 4 },
  accountPicker:     { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  accountPickerText: { flex: 1, fontSize: FONTS.size.md, color: COLORS.text, fontWeight: '600' },
  dateInput:         { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: FONTS.size.sm, color: COLORS.text, backgroundColor: '#fff', minWidth: 90 },
  loadBtn:           { backgroundColor: COLORS.primary, padding: 9, borderRadius: RADIUS.sm },
  loadBtnDisabled:   { backgroundColor: COLORS.textLight },
  summaryCard:       { marginBottom: 10 },
  accountNameText:   { fontSize: FONTS.size.lg, fontWeight: '700', color: COLORS.primary, marginBottom: 10 },
  balRow:            { flexDirection: 'row', gap: 16 },
  balItem:           { flex: 1 },
  balLabel:          { fontSize: FONTS.size.xs, color: COLORS.textMuted, marginBottom: 2 },
  balValue:          { fontSize: FONTS.size.md, fontWeight: '700' },
  modalContainer:    { flex: 1, backgroundColor: '#fff' },
  modalHeader:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle:        { fontSize: FONTS.size.xl, fontWeight: '700', color: COLORS.text },
  modalSearch:       { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, margin: 12, paddingHorizontal: 12, gap: 8, backgroundColor: COLORS.bg },
  modalSearchInput:  { flex: 1, paddingVertical: 10, fontSize: FONTS.size.md, color: COLORS.text },
  acPickerItem:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  acPickerItemActive:{ backgroundColor: COLORS.primary + '10' },
  acPickerCode:      { width: 44, fontSize: FONTS.size.sm, color: COLORS.textMuted, fontFamily: 'monospace' },
  acPickerName:      { fontSize: FONTS.size.md, color: COLORS.text, fontWeight: '600' },
  acPickerUr:        { fontSize: FONTS.size.sm, color: COLORS.textMuted },
});
