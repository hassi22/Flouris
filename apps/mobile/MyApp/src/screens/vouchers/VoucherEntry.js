/**
 * Voucher Entry Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { getVouchers, deleteVoucher, getVoucherTypes } from '../../services/sqliteService';
import {
  PageHeader, PrimaryButton, ConfirmModal, Toast, EmptyState, Badge, ScrollHeader,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

function PKR(n) {
  if (n == null || n === 0) return '—';
  return Number(n).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VoucherEntry() {
  const { t, isUrdu } = useLang();
  const navigation = useNavigation();
  const { currentDb, notification, showNotification, dbInfo, refreshDb } = useDatabase();

  const [vouchers,    setVouchers]    = useState([]);
  const [vtypes,      setVtypes]      = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [searchQ,     setSearchQ]     = useState('');
  const [startDate,   setStartDate]   = useState('');
  const [endDate,     setEndDate]     = useState('');
  const [deleteId,    setDeleteId]    = useState(null);
  const scrollY = React.useRef(new Animated.Value(0)).current;

  const loadVouchers = useCallback(async () => {
    if (!currentDb) return;
    setLoading(true);
    try {
      const result = await getVouchers(currentDb, {
        startDate: startDate || undefined,
        endDate:   endDate   || undefined,
      });
      if (result.success) {
        const seen = new Set();
        const deduped = (result.data || []).filter(r => {
          if (seen.has(r.TR_No)) return false;
          seen.add(r.TR_No);
          return true;
        });
        setVouchers(deduped);
      }
    } catch (_) {}
    setLoading(false);
  }, [currentDb, startDate, endDate]);

  useEffect(() => {
    if (!currentDb) return;
    getVoucherTypes(currentDb).then(vt => { if (vt.success) setVtypes(vt.data || []); });
  }, [currentDb]);

  useEffect(() => { loadVouchers(); }, [loadVouchers, dbInfo?.lastRefresh]);

  const handleDelete = async () => {
    const result = await deleteVoucher(currentDb, deleteId);
    setDeleteId(null);
    if (result.success) {
      showNotification(isUrdu ? 'ووچر حذف ہو گیا' : 'Voucher deleted', 'success');
      refreshDb();
      loadVouchers();
    } else {
      showNotification(result.error || 'Delete failed', 'error');
    }
  };

  const filtered = searchQ
    ? vouchers.filter(v =>
        String(v.TR_No).includes(searchQ) ||
        String(v.V_No || '').includes(searchQ) ||
        (v.Remarks || '').toLowerCase().includes(searchQ.toLowerCase())
      )
    : vouchers;

  const vtypeLabel = (vtype) => {
    const vt = vtypes.find(v => Number(v.VTYPE) === Number(vtype));
    if (!vt) return `V${vtype}`;
    return isUrdu ? (vt.UVTITLE || vt.VTITLE) : vt.VTITLE;
  };

  const renderItem = ({ item }) => (
    <View style={styles.voucherCard}>
      <View style={styles.voucherHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.voucherNo}>#{item.TR_No}{item.V_No ? ` / V${item.V_No}` : ''}</Text>
          <Text style={styles.voucherDate}>
            {item.TR_Date
              ? new Date(item.TR_Date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
              : '—'}
          </Text>
        </View>
        <Badge label={vtypeLabel(item.VType)} color={COLORS.primary} />
      </View>
      {item.Remarks ? <Text style={styles.voucherRemarks} numberOfLines={1}>{item.Remarks}</Text> : null}
      <View style={styles.voucherAmount}>
        <Text style={styles.voucherAmtLabel}>{isUrdu ? 'رقم:' : 'Amount:'}</Text>
        <Text style={styles.voucherAmtVal}>{PKR(item.Amount)}</Text>
      </View>
      <View style={styles.voucherActions}>
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => navigation.navigate('VoucherForm', { trNo: item.TR_No })}
        >
          <Icon name="pencil-outline" size={15} color={COLORS.primary} />
          <Text style={styles.editBtnText}>{t.edit}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => setDeleteId(item.TR_No)}>
          <Icon name="trash-outline" size={15} color={COLORS.danger} />
          <Text style={styles.deleteBtnText}>{t.delete}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <ConfirmModal
        visible={!!deleteId}
        title={t.confirmDelete}
        message={t.deleteConfirmMsg}
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
        confirmLabel={t.delete}
        danger
      />

      <ScrollHeader scrollY={scrollY}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.voucherEntry}</Text>
          <Text style={styles.headerSub}>{isUrdu ? 'تمام ووچرز' : `${filtered.length} vouchers`}</Text>
        </View>
        <PrimaryButton
          title={isUrdu ? 'نئی' : 'New'}
          onPress={() => navigation.navigate('VoucherForm', {})}
          disabled={!currentDb}
          small
          icon={<Icon name="add" size={16} color="#fff" />}
        />
      </View>
      </ScrollHeader>

      <View style={styles.filterBar}>
        <View style={styles.searchRow}>
          <Icon name="search-outline" size={15} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQ}
            onChangeText={setSearchQ}
            placeholder={isUrdu ? 'ووچر نمبر یا ملاحظات تلاش کریں' : 'Search by voucher # or remarks'}
            placeholderTextColor={COLORS.textLight}
          />
        </View>
        <View style={styles.dateRow}>
          <TextInput style={styles.dateInput} value={startDate} onChangeText={setStartDate}
            placeholder={isUrdu ? 'شروع' : 'From'} placeholderTextColor={COLORS.textLight} />
          <TextInput style={styles.dateInput} value={endDate} onChangeText={setEndDate}
            placeholder={isUrdu ? 'آخر' : 'To'} placeholderTextColor={COLORS.textLight} />
          <TouchableOpacity style={styles.applyBtn} onPress={loadVouchers}>
            <Icon name="search-outline" size={15} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {!currentDb ? (
        <EmptyState title={t.noDatabaseSelected} subtitle={t.selectDbFirst}
          icon={<Icon name="document-text-outline" size={48} color={COLORS.textLight} />} />
      ) : loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : (
        <Animated.FlatList
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
          data={filtered}
          keyExtractor={item => String(item.TR_No)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState title={t.noData}
              icon={<Icon name="receipt-outline" size={40} color={COLORS.textLight} />} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.bg },
  center:          { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header:          { backgroundColor: COLORS.bg, paddingTop: 50, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: COLORS.border},
  headerTitle:     { color: COLORS.text, fontSize: FONTS.size.xl, fontWeight: '800'},
  headerSub:       { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 2 },
  filterBar:       { backgroundColor: '#fff', padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border,borderRadius: RADIUS.md, margin: 12, marginBottom: 0, ...SHADOW.sm },
  searchRow:       { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.bg, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 7, gap: 8, marginBottom: 8 },
  searchInput:     { flex: 1, fontSize: FONTS.size.sm, color: COLORS.text },
  dateRow:         { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateInput:       { flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 8, paddingVertical: 6, fontSize: FONTS.size.sm, color: COLORS.text, backgroundColor: '#fff' },
  applyBtn:        { backgroundColor: COLORS.primary, padding: 9, borderRadius: RADIUS.sm },
  list:            { padding: 12, gap: 8, paddingBottom: 40 },
  voucherCard:     { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, ...SHADOW.sm },
  voucherHeader:   { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 },
  voucherNo:       { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text },
  voucherDate:     { fontSize: FONTS.size.sm, color: COLORS.textMuted, marginTop: 2 },
  voucherRemarks:  { fontSize: FONTS.size.sm, color: COLORS.textMuted, marginBottom: 6 },
  voucherAmount:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  voucherAmtLabel: { fontSize: FONTS.size.sm, color: COLORS.textMuted },
  voucherAmtVal:   { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.primary },
  voucherActions:  { flexDirection: 'row', gap: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 8 },
  editBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: COLORS.primary + '10', borderRadius: RADIUS.sm },
  editBtnText:     { fontSize: FONTS.size.sm, color: COLORS.primary, fontWeight: '600' },
  deleteBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: COLORS.danger + '10', borderRadius: RADIUS.sm },
  deleteBtnText:   { fontSize: FONTS.size.sm, color: COLORS.danger, fontWeight: '600' },
});
