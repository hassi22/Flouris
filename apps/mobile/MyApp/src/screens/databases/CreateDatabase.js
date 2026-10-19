/**
 * Create New Database Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { createNewDatabase } from '../../services/sqliteService';
import { Input, PrimaryButton, Card, Toast, LoadingOverlay } from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

export default function CreateDatabase() {
  const { t, isUrdu } = useLang();
  const navigation = useNavigation();
  const { loadDatabases, selectDatabase, showNotification, notification } = useDatabase();

  const [companyName,   setCompanyName]   = useState('');
  const [companyNameUr, setCompanyNameUr] = useState('');
  const [dbName,        setDbName]        = useState('');
  const [creating,      setCreating]      = useState(false);

  const handleCreate = async () => {
    const name = (dbName || companyName).trim().replace(/[^a-zA-Z0-9_\-]/g, '_');
    if (!name) {
      Alert.alert(t.error, isUrdu ? 'ڈیٹا بیس کا نام درج کریں' : 'Database name is required');
      return;
    }
    if (!companyName.trim()) {
      Alert.alert(t.error, isUrdu ? 'کمپنی کا نام درج کریں' : 'Company name is required');
      return;
    }

    setCreating(true);
    try {
      // createNewDatabase is async — await it
      const result = await createNewDatabase(name, companyName.trim(), companyNameUr.trim());
      if (!result || !result.success || !result.dbName) {
        throw new Error(result?.error || 'Failed to create database');
      }
      showNotification(isUrdu ? 'ڈیٹا بیس بن گئی' : 'Database created', 'success');
      // Reload database list then fully open/validate the new DB so all
      // screens (accounts, vouchers, groups) immediately see the seeded data.
      await loadDatabases();
      await selectDatabase(result.dbName);
      navigation.navigate('Tabs');
    } catch (error) {
      Alert.alert(t.error, error.message || 'Failed to create database');
    } finally {
      setCreating(false);
    }
  };

  const previewName = (dbName || companyName || 'MyCompany').trim().replace(/[^a-zA-Z0-9_\-]/g, '_') || 'company';

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Toast notification={notification} />
      <LoadingOverlay visible={creating} message={isUrdu ? 'ڈیٹا بیس بن رہی ہے…' : 'Creating database…'} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

        {/* Banner */}
        <View style={styles.hero}>
          <View style={styles.bannerIcon}>
            <Icon name="sparkles-outline" size={26} color={COLORS.primary} />
          </View>
          <Text style={styles.eyebrow}>{isUrdu ? 'نیا سیٹ اپ' : 'NEW SETUP'}</Text>
          <Text style={styles.bannerTitle}>{isUrdu ? 'نئی کمپنی ڈیٹا بیس' : 'New company database'}</Text>
          <Text style={styles.bannerSub}>
            {isUrdu
              ? 'تمام اکاؤنٹ ہیڈز، وصول نامہ اقسام اور بنیادی اکاؤنٹس خودکار شامل ہوں گے'
              : 'Pre-seeded with account heads, voucher types, and essential accounts'}
          </Text>
        </View>

        <Card style={styles.glassCard}>
          <Text style={styles.sectionLabel}>{isUrdu ? 'کمپنی معلومات' : 'Company Information'}</Text>
          <Input label={isUrdu ? 'کمپنی کا نام (انگریزی) *' : 'Company Name (English) *'}
            value={companyName} onChangeText={setCompanyName} placeholder="My Company Pvt Ltd" />
          <Input label={isUrdu ? 'کمپنی کا نام (اردو)' : 'Company Name (Urdu)'}
            value={companyNameUr} onChangeText={setCompanyNameUr} placeholder="میری کمپنی" isUrdu />
          <Input label={isUrdu ? 'ڈیٹا بیس فائل کا نام *' : 'Database File Name *'}
            value={dbName} onChangeText={setDbName}
            placeholder={isUrdu ? 'خودکار (کمپنی نام سے)' : 'Auto-generated from company name'} />
          <Text style={styles.hint}>
            {isUrdu ? 'فائل کا نام: ' : 'File will be saved as: '}
            <Text style={{ fontWeight: '700', color: COLORS.primary }}>{previewName}.sqlite</Text>
          </Text>
        </Card>

        {/* Schema Preview */}
        <Card style={styles.glassCard}>
          <Text style={styles.sectionLabel}>{isUrdu ? 'شامل چیزیں' : 'What gets created'}</Text>
          {[
            { icon: 'people-outline',    en: '5 Account Heads (Capital, Liabilities, Assets, Income, Expenses)', ur: '5 اکاؤنٹ ہیڈز' },
            { icon: 'layers-outline',    en: '10 Sub-account groups (Cash, Banks, Parties…)',                   ur: '10 ذیلی گروپس' },
            { icon: 'pricetag-outline',  en: '10 Voucher Types (Opening, Cash Receipt/Payment, Purchase, Sale…)', ur: '10 وصول نامہ اقسام' },
            { icon: 'cash-outline',      en: '3 Essential accounts: Cash In Hand, Purchase, Sales',             ur: '3 بنیادی اکاؤنٹس: نقد، خرید، فروخت' },
            { icon: 'construct-outline', en: 'Full double-entry schema ready to use',                           ur: 'مکمل ڈبل انٹری اسکیما' },
          ].map((item, i) => (
            <View key={i} style={styles.featureRow}>
              <Icon name={item.icon} size={16} color={COLORS.primary} />
              <Text style={styles.featureText}>{isUrdu ? item.ur : item.en}</Text>
            </View>
          ))}
        </Card>

        <PrimaryButton
          title={isUrdu ? 'ڈیٹا بیس بنائیں' : 'Create Database'}
          onPress={handleCreate}
          loading={creating}
          icon={<Icon name="add-circle-outline" size={18} color="#fff" />}
        />
        <View style={{ height: 60 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  scroll:       { padding: 20, paddingTop: 14, gap: 14, paddingBottom: 40 },
  hero:         { backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: RADIUS.xl, padding: 22, marginBottom: 2, ...SHADOW.sm },
  bannerIcon:   { width: 54, height: 54, borderRadius: 18, backgroundColor: COLORS.primaryLight + '35', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  eyebrow:      { color: COLORS.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, marginBottom: 5 },
  bannerTitle:  { color: COLORS.text, fontSize: FONTS.size.xxl, fontWeight: '800' },
  bannerSub:    { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 8, lineHeight: 20 },
  glassCard:    { backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, shadowOpacity: 0.04 },
  sectionLabel: { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  hint:         { fontSize: FONTS.size.sm, color: COLORS.textMuted, marginTop: -6, marginBottom: 4 },
  featureRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  featureText:  { flex: 1, fontSize: FONTS.size.sm, color: COLORS.text, lineHeight: 20 },
});
