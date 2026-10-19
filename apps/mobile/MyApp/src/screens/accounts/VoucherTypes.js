/**
 * Voucher Types Manager — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { getVoucherTypes, saveVoucherType, deleteVoucherType } from '../../services/sqliteService';
import {
  PrimaryButton, Input, ConfirmModal, Toast, EmptyState,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

const blank = () => ({ isEdit: false, VTYPE: '', VTITLE: '', UVTITLE: '', LDr: '', LCr: '' });
const SIDE_LABELS = { '': '—', '0': 'Cash (0)', '1': 'Party 1', '2': 'Party 2' };

export default function VoucherTypes() {
  const { t, isUrdu } = useLang();
  const { currentDb, showNotification, notification, dbInfo } = useDatabase();

  const [vtypes,   setVtypes]   = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form,     setForm]     = useState(blank());
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    if (!currentDb) return;
    const result = await getVoucherTypes(currentDb);
    if (result.success) setVtypes(result.data || []);
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  const handleSave = async () => {
    if (!form.VTYPE || !form.VTITLE.trim()) {
      Alert.alert(t.error, isUrdu ? 'کوڈ اور نام درج کریں' : 'Code and title required');
      return;
    }
    const result = await saveVoucherType(currentDb, form);
    if (result.success) {
      showNotification(isUrdu ? 'وصول نامہ قسم محفوظ ہو گئی' : 'Voucher type saved', 'success');
      setFormOpen(false);
      load();
    } else {
      Alert.alert(t.error, result.error);
    }
  };

  const handleDelete = async () => {
    const result = await deleteVoucherType(currentDb, deleteId);
    setDeleteId(null);
    if (result.success) {
      showNotification(isUrdu ? 'وصول نامہ قسم حذف ہو گئی' : 'Voucher type deleted', 'success');
      load();
    } else {
      showNotification(result.error, 'error');
    }
  };

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <ConfirmModal visible={!!deleteId} title={t.confirmDelete} message={t.deleteConfirmMsg}
        onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel={t.delete} danger />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.voucherTypeMgr}</Text>
          <Text style={styles.headerSub}>{vtypes.length} {isUrdu ? 'اقسام' : 'types'}</Text>
        </View>
        <PrimaryButton title={t.add} onPress={() => { setForm(blank()); setFormOpen(true); }}
          small icon={<Icon name="add" size={16} color="#fff" />} />
      </View>

      {!currentDb ? (
        <EmptyState title={t.noDatabaseSelected} subtitle={t.selectDbFirst}
          icon={<Icon name="pricetag-outline" size={48} color={COLORS.textLight} />} />
      ) : (
        <FlatList
          data={vtypes}
          keyExtractor={item => String(item.VTYPE)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t.noData} icon={<Icon name="pricetag-outline" size={40} color={COLORS.textLight} />} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.codeBox}>
                <Text style={styles.code}>{item.VTYPE}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.VTITLE}</Text>
                {item.UVTITLE ? <Text style={styles.ur}>{item.UVTITLE}</Text> : null}
                <Text style={styles.sides}>
                  Dr: {SIDE_LABELS[String(item.LDr)] || item.LDr} | Cr: {SIDE_LABELS[String(item.LCr)] || item.LCr}
                </Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => {
                  setForm({ isEdit: true, VTYPE: String(item.VTYPE), VTITLE: item.VTITLE || '', UVTITLE: item.UVTITLE || '', LDr: item.LDr != null ? String(item.LDr) : '', LCr: item.LCr != null ? String(item.LCr) : '' });
                  setFormOpen(true);
                }}>
                  <Icon name="pencil-outline" size={16} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleteId(item.VTYPE)}>
                  <Icon name="trash-outline" size={16} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{form.isEdit ? t.edit : t.add} {isUrdu ? 'وصول نامہ قسم' : 'Voucher Type'}</Text>
            <TouchableOpacity onPress={() => setFormOpen(false)}>
              <Icon name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16 }}>
            <Input label={isUrdu ? 'کوڈ (نمبر)' : 'Type Code'}
              value={form.VTYPE} onChangeText={v => setForm(f => ({ ...f, VTYPE: v }))}
              keyboardType="numeric" placeholder="100" editable={!form.isEdit} />
            <Input label={isUrdu ? 'نام (انگریزی)' : 'Title (English)'}
              value={form.VTITLE} onChangeText={v => setForm(f => ({ ...f, VTITLE: v }))} placeholder="Cash Payment" />
            <Input label={isUrdu ? 'نام (اردو)' : 'Title (Urdu)'}
              value={form.UVTITLE} onChangeText={v => setForm(f => ({ ...f, UVTITLE: v }))} placeholder="نقد ادائیگی" isUrdu />

            <Text style={styles.fieldLabel}>{isUrdu ? 'ڈیبٹ سائیڈ' : 'Debit Side'}</Text>
            <View style={styles.sideRow}>
              {[['', '—'], ['0', 'Cash'], ['1', 'Party'], ['2', 'Party 2']].map(([val, label]) => (
                <TouchableOpacity key={val}
                  style={[styles.sideChip, form.LDr === val && styles.sideChipActive]}
                  onPress={() => setForm(f => ({ ...f, LDr: val }))}>
                  <Text style={[styles.sideChipText, form.LDr === val && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{isUrdu ? 'کریڈٹ سائیڈ' : 'Credit Side'}</Text>
            <View style={styles.sideRow}>
              {[['', '—'], ['0', 'Cash'], ['1', 'Party'], ['2', 'Party 2']].map(([val, label]) => (
                <TouchableOpacity key={val}
                  style={[styles.sideChip, form.LCr === val && styles.sideChipActive]}
                  onPress={() => setForm(f => ({ ...f, LCr: val }))}>
                  <Text style={[styles.sideChipText, form.LCr === val && { color: '#fff' }]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <PrimaryButton title={t.save} onPress={handleSave} style={{ marginTop: 20 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: COLORS.bg },
  header:         { backgroundColor: COLORS.bg, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:    { color: COLORS.text, fontSize: FONTS.size.xl, fontWeight: '800' },
  headerSub:      { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 2 },
  list:           { padding: 12, paddingBottom: 40 },
  card:           { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, ...SHADOW.sm },
  codeBox:        { width: 44, height: 44, borderRadius: RADIUS.sm, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center' },
  code:           { fontSize: FONTS.size.sm, fontWeight: '800', color: COLORS.primary },
  name:           { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text },
  ur:             { fontSize: FONTS.size.sm, color: COLORS.textMuted },
  sides:          { fontSize: FONTS.size.xs, color: COLORS.textLight, marginTop: 2 },
  actions:        { flexDirection: 'row' },
  iconBtn:        { padding: 8 },
  modal:          { flex: 1, backgroundColor: '#fff' },
  modalHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle:     { fontSize: FONTS.size.xl, fontWeight: '700', color: COLORS.text },
  fieldLabel:     { fontSize: FONTS.size.sm, fontWeight: '600', color: COLORS.text, marginBottom: 6, marginTop: 8 },
  sideRow:        { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  sideChip:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg },
  sideChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  sideChipText:   { fontSize: FONTS.size.sm, color: COLORS.text, fontWeight: '600' },
});
