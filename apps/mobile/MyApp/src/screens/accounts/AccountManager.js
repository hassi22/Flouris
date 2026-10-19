/**
 * Account Manager Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput,
  Modal, Pressable, Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import {
  getChartOfAccounts, saveAccount, deleteAccount, getAccountHeads,
} from '../../services/sqliteService';
import {
  PrimaryButton, Input, ConfirmModal, Toast, EmptyState,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

const blankAc = () => ({ CA: null, SubAccID: '', AC_TITLE1: '', UAC_Title: '', Cell1: '', Remarks: '' });

export default function AccountManager() {
  const { t, isUrdu } = useLang();
  const { currentDb, showNotification, refreshDb, notification, dbInfo } = useDatabase();

  const [accounts,        setAccounts]        = useState([]);
  const [groups,          setGroups]          = useState([]);
  const [searchQ,         setSearchQ]         = useState('');
  const [formOpen,        setFormOpen]        = useState(false);
  const [form,            setForm]            = useState(blankAc());
  const [deleteId,        setDeleteId]        = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [groupSearch,     setGroupSearch]     = useState('');

  const loadAccounts = useCallback(async () => {
    if (!currentDb) return;
    const r = await getChartOfAccounts(currentDb);
    if (r.success) setAccounts(r.data || []);
  }, [currentDb]);

  const loadGroups = useCallback(async () => {
    if (!currentDb) return;
    const r = await getAccountHeads(currentDb);
    if (r.success) setGroups(r.data || []);
  }, [currentDb]);

  useEffect(() => { loadAccounts(); loadGroups(); }, [loadAccounts, loadGroups, dbInfo?.lastRefresh]);

  const openAdd  = () => { setForm(blankAc()); setFormOpen(true); };
  const openEdit = (ac) => {
    setForm({
      CA: ac.CA, SubAccID: String(ac.SubAccID || ''),
      AC_TITLE1: ac.AC_TITLE1 || '', UAC_Title: ac.UAC_TITLE || '',
      Cell1: ac.Cell1 || '', Remarks: '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.AC_TITLE1.trim()) {
      Alert.alert(t.error, isUrdu ? 'اکاؤنٹ کا نام درج کریں' : 'Account name is required');
      return;
    }
    setSaving(true);
    const result = await saveAccount(currentDb, { ...form, SubAccID: Number(form.SubAccID) || 0 });
    setSaving(false);
    if (result.success) {
      showNotification(isUrdu ? 'اکاؤنٹ محفوظ ہو گیا' : 'Account saved', 'success');
      setFormOpen(false);
      refreshDb();
      loadAccounts();
    } else {
      Alert.alert(t.error, result.error || 'Save failed');
    }
  };

  const handleDelete = async () => {
    const result = await deleteAccount(currentDb, deleteId);
    setDeleteId(null);
    if (result.success) {
      showNotification(isUrdu ? 'اکاؤنٹ حذف ہو گیا' : 'Account deleted', 'success');
      refreshDb(); loadAccounts();
    } else {
      showNotification(result.error, 'error');
    }
  };

  const filtered = searchQ
    ? accounts.filter(a =>
        (a.AC_TITLE1 || '').toLowerCase().includes(searchQ.toLowerCase()) ||
        (a.UAC_TITLE || '').includes(searchQ) ||
        String(a.CA).includes(searchQ))
    : accounts;

  const groupName = (subAccId) => {
    const g = groups.find(g => g.SubAccID === Number(subAccId));
    return g ? (isUrdu ? (g.SubAccountNAmeU || g.SubAccountNAme) : g.SubAccountNAme) : '';
  };

  const filteredGroups = groupSearch
    ? groups.filter(g => (g.SubAccountNAme || '').toLowerCase().includes(groupSearch.toLowerCase()))
    : groups;

  return (
    <View style={styles.container}>
      <Toast notification={notification} />
      <ConfirmModal visible={!!deleteId} title={t.confirmDelete} message={t.deleteConfirmMsg}
        onConfirm={handleDelete} onCancel={() => setDeleteId(null)} confirmLabel={t.delete} danger />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.accountManager}</Text>
          <Text style={styles.headerSub}>{filtered.length} {isUrdu ? 'اکاؤنٹس' : 'accounts'}</Text>
        </View>
        <PrimaryButton title={t.add} onPress={openAdd} small icon={<Icon name="add" size={16} color="#fff" />} />
      </View>

      <View style={styles.searchBar}>
        <Icon name="search-outline" size={15} color={COLORS.textMuted} />
        <TextInput style={styles.searchInput} value={searchQ} onChangeText={setSearchQ}
          placeholder={t.searchAccounts} placeholderTextColor={COLORS.textLight} />
        {searchQ ? (
          <TouchableOpacity onPress={() => setSearchQ('')}>
            <Icon name="close" size={15} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {!currentDb ? (
        <EmptyState title={t.noDatabaseSelected} subtitle={t.selectDbFirst}
          icon={<Icon name="people-outline" size={48} color={COLORS.textLight} />} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.CA)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<EmptyState title={t.noData} icon={<Icon name="person-outline" size={40} color={COLORS.textLight} />} />}
          renderItem={({ item }) => (
            <View style={styles.acCard}>
              <View style={styles.acMain}>
                <Text style={styles.acCode}>{item.CA}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.acName}>{item.AC_TITLE1}</Text>
                  {item.UAC_TITLE ? <Text style={styles.acUr}>{item.UAC_TITLE}</Text> : null}
                  {item.SubAccID ? <Text style={styles.acGroup}>{groupName(item.SubAccID)}</Text> : null}
                </View>
              </View>
              <View style={styles.acActions}>
                <TouchableOpacity style={styles.iconBtn} onPress={() => openEdit(item)}>
                  <Icon name="pencil-outline" size={16} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconBtn} onPress={() => setDeleteId(item.CA)}>
                  <Icon name="trash-outline" size={16} color={COLORS.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal visible={formOpen} animationType="slide" onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{form.CA ? t.edit : t.add} {isUrdu ? 'اکاؤنٹ' : 'Account'}</Text>
            <TouchableOpacity onPress={() => setFormOpen(false)}>
              <Icon name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, padding: 16 }}>
            <Input label={isUrdu ? 'اکاؤنٹ کا نام (انگریزی)' : 'Account Name (English)'}
              value={form.AC_TITLE1} onChangeText={v => setForm(f => ({ ...f, AC_TITLE1: v }))} placeholder="Account Title" />
            <Input label={isUrdu ? 'اکاؤنٹ کا نام (اردو)' : 'Account Name (Urdu)'}
              value={form.UAC_Title} onChangeText={v => setForm(f => ({ ...f, UAC_Title: v }))} placeholder="اردو نام" isUrdu />
            <Input label={isUrdu ? 'فون/سیل' : 'Phone / Cell'}
              value={form.Cell1} onChangeText={v => setForm(f => ({ ...f, Cell1: v }))} placeholder="+92..." keyboardType="phone-pad" />

            <TouchableOpacity style={styles.pickerField} onPress={() => { setGroupPickerOpen(true); setGroupSearch(''); }}>
              <Text style={styles.pickerLabel}>{isUrdu ? 'گروپ' : 'Group (Sub Account)'}</Text>
              <Text style={[styles.pickerValue, !form.SubAccID && { color: COLORS.textLight }]}>
                {form.SubAccID ? groupName(form.SubAccID) || `Group ${form.SubAccID}` : (isUrdu ? 'گروپ منتخب کریں' : 'Select group')}
              </Text>
            </TouchableOpacity>

            <PrimaryButton title={t.save} onPress={handleSave} loading={saving} style={{ marginTop: 16 }} />
          </View>
        </View>
      </Modal>

      {/* Group Picker Modal */}
      <Modal visible={groupPickerOpen} animationType="slide" onRequestClose={() => setGroupPickerOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{isUrdu ? 'گروپ منتخب کریں' : 'Select Group'}</Text>
            <TouchableOpacity onPress={() => setGroupPickerOpen(false)}>
              <Icon name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.modalSearch}>
            <Icon name="search-outline" size={16} color={COLORS.textMuted} />
            <TextInput style={styles.modalSearchInput} value={groupSearch} onChangeText={setGroupSearch}
              placeholder={isUrdu ? 'تلاش کریں' : 'Search…'} autoFocus placeholderTextColor={COLORS.textLight} />
          </View>
          <FlatList
            data={filteredGroups}
            keyExtractor={item => String(item.SubAccID)}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.pickerItem, form.SubAccID === String(item.SubAccID) && { backgroundColor: COLORS.primary + '10' }]}
                onPress={() => { setForm(f => ({ ...f, SubAccID: String(item.SubAccID) })); setGroupPickerOpen(false); }}
              >
                <Text style={styles.pickerItemCode}>{item.SubAccID}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerItemName}>{item.SubAccountNAme}</Text>
                  {item.SubAccountNAmeU ? <Text style={styles.pickerItemUr}>{item.SubAccountNAmeU}</Text> : null}
                </View>
                {form.SubAccID === String(item.SubAccID) && <Icon name="checkmark" size={18} color={COLORS.primary} />}
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
  container:        { flex: 1, backgroundColor: COLORS.bg },
  header:           { backgroundColor: COLORS.bg, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:      { color: COLORS.text, fontSize: FONTS.size.xl, fontWeight: '800' },
  headerSub:        { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 2 },
  searchBar:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8 },
  searchInput:      { flex: 1, fontSize: FONTS.size.md, color: COLORS.text },
  list:             { padding: 12, paddingBottom: 40 },
  acCard:           { backgroundColor: '#fff', borderRadius: RADIUS.md, padding: 12, flexDirection: 'row', alignItems: 'center', ...SHADOW.sm },
  acMain:           { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  acCode:           { width: 40, fontSize: FONTS.size.sm, color: COLORS.primary, fontWeight: '700', paddingTop: 2 },
  acName:           { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text },
  acUr:             { fontSize: FONTS.size.sm, color: COLORS.textMuted, marginTop: 1 },
  acGroup:          { fontSize: FONTS.size.xs, color: COLORS.primary, marginTop: 2, backgroundColor: COLORS.primary + '10', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 100, alignSelf: 'flex-start' },
  acActions:        { flexDirection: 'row', gap: 4 },
  iconBtn:          { padding: 8 },
  pickerField:      { marginBottom: 12 },
  pickerLabel:      { fontSize: FONTS.size.sm, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  pickerValue:      { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm, paddingHorizontal: 12, paddingVertical: 9, fontSize: FONTS.size.md, color: COLORS.text, backgroundColor: '#fff' },
  modal:            { flex: 1, backgroundColor: '#fff' },
  modalHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  modalTitle:       { fontSize: FONTS.size.xl, fontWeight: '700', color: COLORS.text },
  modalSearch:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: RADIUS.md, margin: 12, paddingHorizontal: 12, gap: 8, backgroundColor: COLORS.bg },
  modalSearchInput: { flex: 1, paddingVertical: 10, fontSize: FONTS.size.md, color: COLORS.text },
  pickerItem:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  pickerItemCode:   { width: 44, fontSize: FONTS.size.sm, color: COLORS.textMuted },
  pickerItemName:   { fontSize: FONTS.size.md, color: COLORS.text, fontWeight: '600' },
  pickerItemUr:     { fontSize: FONTS.size.sm, color: COLORS.textMuted },
});
