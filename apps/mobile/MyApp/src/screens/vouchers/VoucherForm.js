/**
 * Voucher Form — Flouris ERP Mobile (bare RN)
 * Add / Edit a voucher with dynamic lines.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  FlatList, Modal, Pressable, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import {
  getVouchers, saveVoucher, getVoucherTypes, getChartOfAccounts,
} from '../../services/sqliteService';
import {
  PrimaryButton, Input, Card, LoadingOverlay, Toast,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

const newLine = () => ({
  VType: '', Account_Party: '', AC_Party2: '', Amount: '', Narration: '',
  _partyName: '', _party2Name: '', _vtypeName: '',
});

export default function VoucherForm() {
  const { t, isUrdu } = useLang();
  const navigation = useNavigation();
  const route      = useRoute();
  const { currentDb, showNotification, refreshDb, notification } = useDatabase();

  const trNo   = route.params?.trNo;
  const isEdit = !!trNo;

  const [saving,      setSaving]      = useState(false);
  const [vtypes,      setVtypes]      = useState([]);
  const [accounts,    setAccounts]    = useState([]);
  const [trDate,      setTrDate]      = useState(new Date().toISOString().slice(0, 10));
  const [vNo,         setVNo]         = useState('');
  const [remarks,     setRemarks]     = useState('');
  const [lines,       setLines]       = useState([newLine()]);
  const [pickerFor,   setPickerFor]   = useState(null);
  const [pickerMode,  setPickerMode]  = useState('account');
  const [pickerSearch, setPickerSearch] = useState('');

  // Update nav title
  useEffect(() => {
    navigation.setOptions({ title: isEdit ? `${t.edit} ${t.voucherEntry}` : t.voucherEntry });
  }, [isEdit, t]);

  // Load VT and accounts
  useEffect(() => {
    if (!currentDb) return;
    Promise.all([getVoucherTypes(currentDb), getChartOfAccounts(currentDb)]).then(([vt, coa]) => {
      if (vt.success)  setVtypes(vt.data   || []);
      if (coa.success) setAccounts(coa.data || []);
    });
  }, [currentDb]);

  // Load existing voucher for edit
  useEffect(() => {
    if (!isEdit || !currentDb || !accounts.length || !vtypes.length) return;
    getVouchers(currentDb, {}).then(result => {
      if (!result.success) return;
      const rows = result.data.filter(r => r.TR_No === Number(trNo));
      if (!rows.length) return;
      const firstRow = rows[0];
      setTrDate(firstRow.TR_Date ? firstRow.TR_Date.slice(0, 10) : '');
      setVNo(String(firstRow.V_No || ''));
      setRemarks(firstRow.Remarks || '');
      const acMap = new Map(accounts.map(a => [a.CA, a]));
      const vtMap = new Map(vtypes.map(v => [Number(v.VTYPE), v]));
      setLines(rows.map(r => ({
        VType:         String(r.VType || ''),
        Account_Party: String(r.Account_Party || ''),
        AC_Party2:     String(r.AC_Party2 || ''),
        Amount:        String(r.Amount || ''),
        Narration:     r.Narration || '',
        _partyName:    acMap.get(r.Account_Party)?.AC_TITLE1 || '',
        _party2Name:   acMap.get(r.AC_Party2)?.AC_TITLE1    || '',
        _vtypeName:    vtMap.get(Number(r.VType))?.VTITLE    || '',
      })));
    });
  }, [isEdit, currentDb, accounts.length, vtypes.length]);

  const updateLine = (idx, field, value) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));

  const addLine    = () => setLines(prev => [...prev, newLine()]);
  const removeLine = (idx) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!trDate) { Alert.alert(t.error, isUrdu ? 'تاریخ درج کریں' : 'Please enter a date'); return; }
    if (!lines.length || !lines[0].VType) {
      Alert.alert(t.error, isUrdu ? 'کم از کم ایک لائن درج کریں' : 'Add at least one line');
      return;
    }
    setSaving(true);
    const voucher = {
      TR_No:        isEdit ? Number(trNo) : null,
      TR_Date:      trDate,
      V_No:         vNo || null,
      Remarks:      remarks,
      AccountParty: Number(lines[0]?.Account_Party || 0),
      ACParty2:     Number(lines[0]?.AC_Party2     || 0),
      Amont:        lines.reduce((s, l) => s + (Number(l.Amount) || 0), 0),
      lines: lines.map(l => ({
        VType:         Number(l.VType         || 0),
        Account_Party: Number(l.Account_Party || 0),
        AC_Party2:     Number(l.AC_Party2     || 0),
        Amount:        Number(l.Amount        || 0),
        Narration:     l.Narration || '',
      })),
    };
    const result = await saveVoucher(currentDb, voucher);
    setSaving(false);
    if (result.success) {
      showNotification(isUrdu ? 'ووچر محفوظ ہو گیا' : 'Voucher saved', 'success');
      refreshDb();
      navigation.goBack();
    } else {
      Alert.alert(t.error, result.error || 'Save failed');
    }
  };

  const openAccountPicker = (lineIdx, field) => {
    setPickerFor({ lineIdx, field });
    setPickerMode('account');
    setPickerSearch('');
  };
  const openVtypePicker = (lineIdx) => {
    setPickerFor({ lineIdx, field: 'VType' });
    setPickerMode('vtype');
    setPickerSearch('');
  };

  const selectAccount = (ac) => {
    const { lineIdx, field } = pickerFor;
    updateLine(lineIdx, field, String(ac.CA));
    updateLine(lineIdx, field === 'Account_Party' ? '_partyName' : '_party2Name',
      isUrdu ? (ac.UAC_TITLE || ac.AC_TITLE1) : ac.AC_TITLE1);
    setPickerFor(null);
  };

  const selectVtype = (vt) => {
    const { lineIdx } = pickerFor;
    updateLine(lineIdx, 'VType', String(vt.VTYPE));
    updateLine(lineIdx, '_vtypeName', isUrdu ? (vt.UVTITLE || vt.VTITLE) : vt.VTITLE);
    setPickerFor(null);
  };

  const filteredAccounts = pickerSearch
    ? accounts.filter(a =>
        (a.AC_TITLE1 || '').toLowerCase().includes(pickerSearch.toLowerCase()) ||
        String(a.CA).includes(pickerSearch))
    : accounts;

  const filteredVtypes = pickerSearch
    ? vtypes.filter(v =>
        (v.VTITLE || '').toLowerCase().includes(pickerSearch.toLowerCase()) ||
        String(v.VTYPE).includes(pickerSearch))
    : vtypes;

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <LoadingOverlay visible={saving} message={isUrdu ? 'محفوظ ہو رہا ہے…' : 'Saving…'} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={styles.sectionLabel}>{isUrdu ? 'ووچر تفصیل' : 'Voucher Details'}</Text>
          <Input label={t.date}      value={trDate}   onChangeText={setTrDate}   placeholder="YYYY-MM-DD" keyboardType="numeric" />
          <Input label={t.voucherNo} value={vNo}      onChangeText={setVNo}      placeholder={isUrdu ? 'ووچر نمبر (اختیاری)' : 'Voucher # (optional)'} keyboardType="numeric" />
          <Input label={t.remarks}   value={remarks}  onChangeText={setRemarks}  placeholder={isUrdu ? 'ملاحظات (اختیاری)' : 'Remarks (optional)'} multiline />
        </Card>

        <Card>
          <View style={styles.lineHeader}>
            <Text style={styles.sectionLabel}>{isUrdu ? 'ووچر لائنز' : 'Voucher Lines'}</Text>
            <TouchableOpacity style={styles.addLineBtn} onPress={addLine}>
              <Icon name="add" size={16} color="#fff" />
              <Text style={styles.addLineBtnText}>{t.addLine}</Text>
            </TouchableOpacity>
          </View>

          {lines.map((line, idx) => (
            <View key={idx} style={styles.lineCard}>
              <View style={styles.lineIndex}>
                <Text style={styles.lineIndexText}>{idx + 1}</Text>
                {lines.length > 1 && (
                  <TouchableOpacity onPress={() => removeLine(idx)}>
                    <Icon name="close-circle" size={18} color={COLORS.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity style={styles.pickerField} onPress={() => openVtypePicker(idx)}>
                <Text style={styles.pickerLabel}>{t.voucherType}</Text>
                <Text style={[styles.pickerValue, !line._vtypeName && { color: COLORS.textLight }]}>
                  {line._vtypeName || (isUrdu ? 'قسم منتخب کریں' : 'Select type')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickerField} onPress={() => openAccountPicker(idx, 'Account_Party')}>
                <Text style={styles.pickerLabel}>{t.party}</Text>
                <Text style={[styles.pickerValue, !line._partyName && { color: COLORS.textLight }]}>
                  {line._partyName || (isUrdu ? 'اکاؤنٹ منتخب کریں' : 'Select account')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.pickerField} onPress={() => openAccountPicker(idx, 'AC_Party2')}>
                <Text style={styles.pickerLabel}>{t.party2}</Text>
                <Text style={[styles.pickerValue, !line._party2Name && { color: COLORS.textLight }]}>
                  {line._party2Name || (isUrdu ? 'دوسرا اکاؤنٹ (اختیاری)' : 'Second account (optional)')}
                </Text>
              </TouchableOpacity>

              <Input label={t.amount}   value={line.Amount}    onChangeText={v => updateLine(idx, 'Amount', v)}    placeholder="0.00" keyboardType="decimal-pad" />
              <Input label={t.narration} value={line.Narration} onChangeText={v => updateLine(idx, 'Narration', v)} placeholder={isUrdu ? 'تفصیل (اختیاری)' : 'Narration (optional)'} />
            </View>
          ))}
        </Card>

        <PrimaryButton title={t.save} onPress={handleSave} disabled={saving} />
        <View style={{ height: 60 }} />
      </ScrollView>

      {/* Picker Modal */}
      <Modal visible={!!pickerFor} animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {pickerMode === 'vtype'
                ? (isUrdu ? 'وصول نامہ قسم' : 'Voucher Type')
                : (isUrdu ? 'اکاؤنٹ منتخب کریں' : 'Select Account')}
            </Text>
            <TouchableOpacity onPress={() => setPickerFor(null)}>
              <Icon name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalSearch}>
            <Icon name="search-outline" size={16} color={COLORS.textMuted} />
            <TextInput style={styles.modalSearchInput} value={pickerSearch} onChangeText={setPickerSearch}
              placeholder={isUrdu ? 'تلاش کریں' : 'Search…'} autoFocus placeholderTextColor={COLORS.textLight} />
          </View>
          {pickerMode === 'vtype' ? (
            <FlatList
              data={filteredVtypes}
              keyExtractor={item => String(item.VTYPE)}
              renderItem={({ item }) => (
                <Pressable style={styles.pickerItem} onPress={() => selectVtype(item)}>
                  <Text style={styles.pickerItemCode}>{item.VTYPE}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemName}>{item.VTITLE}</Text>
                    {item.UVTITLE ? <Text style={styles.pickerItemUr}>{item.UVTITLE}</Text> : null}
                  </View>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: COLORS.borderLight }} />}
            />
          ) : (
            <FlatList
              data={filteredAccounts}
              keyExtractor={item => String(item.CA)}
              renderItem={({ item }) => (
                <Pressable style={styles.pickerItem} onPress={() => selectAccount(item)}>
                  <Text style={styles.pickerItemCode}>{item.CA}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemName}>{item.AC_TITLE1}</Text>
                    {item.UAC_TITLE ? <Text style={styles.pickerItemUr}>{item.UAC_TITLE}</Text> : null}
                  </View>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: COLORS.borderLight }} />}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: COLORS.bg },
  scroll:           { padding: 16, gap: 12 },
  sectionLabel:     { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  lineHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  addLineBtn:       { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: RADIUS.sm, paddingVertical: 6, paddingHorizontal: 10, gap: 4 },
  addLineBtnText:   { color: '#fff', fontSize: FONTS.size.sm, fontWeight: '600' },
  lineCard:         { backgroundColor: COLORS.bg, borderRadius: RADIUS.md, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  lineIndex:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lineIndexText:    { fontSize: FONTS.size.sm, fontWeight: '700', color: COLORS.primary, backgroundColor: COLORS.primary + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.sm },
  pickerField:      { marginBottom: 12 },
  pickerLabel:      { fontSize: FONTS.size.sm, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  pickerValue:      { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: FONTS.size.md, color: COLORS.text, backgroundColor: '#fff' },
  modal:            { flex: 1, backgroundColor: '#fff' },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle:       { fontSize: FONTS.size.xl, fontWeight: '700', color: COLORS.text },
  modalSearch:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, margin: 12, paddingHorizontal: 12, gap: 8, backgroundColor: COLORS.bg },
  modalSearchInput: { flex: 1, paddingVertical: 10, fontSize: FONTS.size.md, color: COLORS.text },
  pickerItem:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  pickerItemCode:   { width: 44, fontSize: FONTS.size.sm, color: COLORS.textMuted, fontFamily: 'monospace' },
  pickerItemName:   { fontSize: FONTS.size.md, color: COLORS.text, fontWeight: '600' },
  pickerItemUr:     { fontSize: FONTS.size.sm, color: COLORS.textMuted },
});
