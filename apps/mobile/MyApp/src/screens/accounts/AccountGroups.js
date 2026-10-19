/**
 * Account Groups Manager — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { getAccountHeads, saveAccountGroup, openDb } from '../../services/sqliteService';
import {
  PrimaryButton, Input, ConfirmModal, Toast, EmptyState,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

const blankGroup = () => ({ isEdit: false, SubAccID: null, AccountID: 1, SubAccountNAme: '', SubAccountNAmeU: '' });
const HEAD_NAMES = { 1: 'Capital/Equity', 2: 'Liabilities', 3: 'Assets', 4: 'Income', 5: 'Expenses' };

export default function AccountGroups() {
  const { t, isUrdu } = useLang();
  const { currentDb, showNotification, notification, dbInfo } = useDatabase();

  const [groups,   setGroups]   = useState([]);
  const [heads,    setHeads]    = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form,     setForm]     = useState(blankGroup());
  const [deleteId, setDeleteId] = useState(null);

  const load = useCallback(async () => {
    if (!currentDb) return;
    const result = await getAccountHeads(currentDb);
    if (result.success) {
      setGroups(result.data  || []);
      setHeads(result.heads  || []);
    }
  }, [currentDb]);

  useEffect(() => { load(); }, [load, dbInfo?.lastRefresh]);

  const handleSave = async () => {
    if (!form.SubAccountNAme.trim()) {
      Alert.alert(t.error, isUrdu ? 'گروپ کا نام درج کریں' : 'Group name required');
      return;
    }
    const result = await saveAccountGroup(currentDb, form);
    if (result.success) {
      showNotification(isUrdu ? 'گروپ محفوظ ہو گیا' : 'Group saved', 'success');
      setFormOpen(false);
      load();
    } else {
      Alert.alert(t.error, result.error);
    }
  };

  const handleDelete = async () => {
    try {
      const db = openDb(currentDb);
      await db.execute('DELETE FROM tblSubAcc WHERE SubAccID=?', [deleteId]);
      showNotification(isUrdu ? 'گروپ حذف ہو گیا' : 'Group deleted', 'success');
      load();
    } catch (e) {
      showNotification(e.message, 'error');
    }
    setDeleteId(null);
  };

  const headName = (id) => {
    const h = heads.find(h => h.id === id);
    return h ? h.name : HEAD_NAMES[id] || `Head ${id}`;
  };

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <ConfirmModal visible={!!deleteId} title={t.confirmDelete} message={t.deleteConfirmMsg}
        onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel={t.delete} danger />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.groupManager}</Text>
          <Text style={styles.headerSub}>{groups.length} {isUrdu ? 'گروپس' : 'groups'}</Text>
        </View>
        <PrimaryButton title={t.add} onPress={() => { setForm(blankGroup()); setFormOpen(true); }}
          small icon={<Icon name="add" size={16} color="#fff" />} />
      </View>

      {!currentDb ? (
        <EmptyState title={t.noDatabaseSelected} subtitle={t.selectDbFirst}
          icon={<Icon name="layers-outline" size={48} color={COLORS.textLight} />} />
      ) : (
        
        <FlatList
          data={groups}
          keyExtractor={item => String(item.SubAccID)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t.noData} icon={<Icon name="layers-outline" size={40} color={COLORS.textLight} />} />}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{item.SubAccountNAme}</Text>
                {item.SubAccountNAmeU ? <Text style={styles.cardUr}>{item.SubAccountNAmeU}</Text> : null}
                <Text style={styles.cardHead}>{headName(item.AccountID)}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => {
                  setForm({ isEdit: true, SubAccID: item.SubAccID, AccountID: item.AccountID, SubAccountNAme: item.SubAccountNAme, SubAccountNAmeU: item.SubAccountNAmeU || '' });
                  setFormOpen(true);
                }}>
                  <Icon name="pencil-outline" size={16} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleteId(item.SubAccID)}>
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
            <Text style={styles.modalTitle}>{form.isEdit ? t.edit : t.add} {isUrdu ? 'گروپ' : 'Group'}</Text>
            <TouchableOpacity onPress={() => setFormOpen(false)}>
              <Icon name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={{ padding: 16 }}>
            <Input label={isUrdu ? 'گروپ کا نام' : 'Group Name (English)'}
              value={form.SubAccountNAme} onChangeText={v => setForm(f => ({ ...f, SubAccountNAme: v }))} placeholder="Group Name" />
            <Input label={isUrdu ? 'اردو نام' : 'Group Name (Urdu)'}
              value={form.SubAccountNAmeU} onChangeText={v => setForm(f => ({ ...f, SubAccountNAmeU: v }))} placeholder="اردو نام" isUrdu />

            <Text style={styles.fieldLabel}>{isUrdu ? 'کھاتہ' : 'Account Head'}</Text>
            <View style={styles.headRow}>
              {[1, 2, 3, 4, 5].map(id => (
                <TouchableOpacity
                  key={id}
                  style={[styles.headChip, form.AccountID === id && styles.headChipActive]}
                  onPress={() => setForm(f => ({ ...f, AccountID: id }))}
                >
                  <Text style={[styles.headChipText, form.AccountID === id && { color: '#fff' }]}>
                    {HEAD_NAMES[id]}
                  </Text>
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
  container:    { flex: 1, backgroundColor: COLORS.bg },
  header:       { backgroundColor: COLORS.bg, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:  { color: COLORS.text, fontSize: FONTS.size.xl, fontWeight: '800' },
  headerSub:    { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 2 },
  list:         { padding: 12, paddingBottom: 40 },
  card:         { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, flexDirection: 'row', alignItems: 'center', ...SHADOW.sm },
  cardName:     { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text },
  cardUr:       { fontSize: FONTS.size.sm, color: COLORS.textMuted, marginTop: 1 },
  cardHead:     { fontSize: FONTS.size.xs, color: COLORS.primary, marginTop: 4, backgroundColor: COLORS.primary + '10', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100, alignSelf: 'flex-start' },
  actions:      { flexDirection: 'row' },
  iconBtn:      { padding: 8 },
  modal:        { flex: 1, backgroundColor: '#fff' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle:   { fontSize: FONTS.size.xl, fontWeight: '700', color: COLORS.text },
  fieldLabel:   { fontSize: FONTS.size.sm, fontWeight: '600', color: COLORS.text, marginBottom: 8, marginTop: 4 },
  headRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  headChip:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg },
  headChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  headChipText: { fontSize: FONTS.size.sm, color: COLORS.text, fontWeight: '600' },
});
