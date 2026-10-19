/**
 * Settings Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, Image, Platform, Animated,
} from 'react-native';
import {
  isSignedIn, signIn, clearTokens, getUserInfo,
  syncDatabaseToDrive,
} from '../../services/googleDriveService';
import Icon from 'react-native-vector-icons/Ionicons';
import { launchImageLibrary } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';

import {
  Card, PrimaryButton, SecondaryButton, GhostButton,
  SectionHeader, Toast, ScrollHeader,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

const APP_VERSION = '1.0.0';

export default function Settings() {
  const { t, isUrdu, lang, toggleLang } = useLang();
  const navigation = useNavigation();
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const {
    currentDb, prefs, savePrefs, showNotification, notification,
    driveSignedIn, setDriveSignedIn, loadDatabases,
  } = useDatabase();

  const [userInfo,        setUserInfo]        = useState(null);
  const [signingIn,       setSigningIn]       = useState(false);
  const [syncing,         setSyncing]         = useState(false);

  useEffect(() => {
    isSignedIn().then(signed => {
      setDriveSignedIn(signed);
      if (signed) getUserInfo().then(setUserInfo);
    });
  }, []);

  // ── Sign-in: native Google Sign-In SDK ─────────────────────────────────────
  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      const result = await signIn();
      if (result.success) {
        setDriveSignedIn(true);
        const info = await getUserInfo();
        setUserInfo(info);
        showNotification(isUrdu ? 'گوگل ڈرائیو سے جڑ گئے' : 'Signed in to Google Drive', 'success');
        await loadDatabases();
      } else if (result.error !== 'Sign-in cancelled by user') {
        showNotification(result.error || (isUrdu ? 'سائن ان ناکام' : 'Sign-in failed'), 'error');
      }
    } catch (e) {
      showNotification(e.message || 'Sign-in error', 'error');
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await clearTokens();
    setDriveSignedIn(false);
    setUserInfo(null);
    showNotification(isUrdu ? 'سائن آؤٹ ہو گئے' : 'Signed out from Google Drive', 'info');
  };

  const handleSyncCurrentDb = async () => {
    if (!currentDb) {
      showNotification(isUrdu ? 'پہلے کوئی ڈیٹا بیس کھولیں' : 'Open a database first', 'error');
      return;
    }
    setSyncing(true);
    try {
      const result = await syncDatabaseToDrive(currentDb);
      if (result.success) {
        showNotification(isUrdu ? 'ڈرائیو پر اپ لوڈ ہو گیا' : 'Uploaded to Google Drive', 'success');
      } else {
        showNotification(result.error || 'Sync failed', 'error');
      }
    } catch (e) {
      showNotification(e.message || 'Sync error', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleChooseLogo = () => {
    launchImageLibrary(
      { mediaType: 'photo', includeBase64: true, quality: 0.7 },
      async (res) => {
        if (res.didCancel || res.errorCode) return;
        const asset = res.assets?.[0];
        if (asset?.base64) {
          const data = `data:image/jpeg;base64,${asset.base64}`;
          await savePrefs({ logoData: data });
          showNotification(isUrdu ? 'لوگو محفوظ ہو گیا' : 'Logo saved', 'success');
        }
      }
    );
  };

  const handleRemoveLogo = async () => {
    await savePrefs({ logoData: null });
    showNotification(isUrdu ? 'لوگو ہٹا دیا گیا' : 'Logo removed', 'info');
  };

  return (
    <View style={styles.container}>
      <Toast notification={notification} />

      <ScrollHeader scrollY={scrollY}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t.settings}</Text>
          <Text style={styles.headerSub}>{isUrdu ? 'ایپلیکیشن ترتیبات' : 'Application preferences'}</Text>
        </View>
      </ScrollHeader>

      <Animated.ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}>

        {/* Language */}
        <Card>
          <SectionHeader title={isUrdu ? 'زبان' : 'Language'} />
          <TouchableOpacity style={styles.settingRow} onPress={toggleLang}>
            <View style={styles.settingInfo}>
              <Icon name="language-outline" size={18} color={COLORS.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>{isUrdu ? 'اردو / English' : 'English / اردو'}</Text>
                <Text style={styles.settingDesc}>{isUrdu ? 'انگریزی پر جائیں' : 'Switch to Urdu'}</Text>
              </View>
            </View>
            <View style={[styles.langBadge, isUrdu && { backgroundColor: COLORS.primary }]}>
              <Text style={[styles.langBadgeText, isUrdu && { color: '#fff' }]}>{lang.toUpperCase()}</Text>
            </View>
          </TouchableOpacity>
        </Card>

        {/* Google Drive */}
        <Card>
          <SectionHeader title={t.googleDrive} />
          <View style={[styles.driveBanner, driveSignedIn ? styles.driveOk : styles.driveMissing]}>
            <Icon name={driveSignedIn ? 'cloud-done-outline' : 'cloud-offline-outline'} size={18} color={driveSignedIn ? COLORS.success : COLORS.danger} />
            <Text style={[styles.driveStatusText, { color: driveSignedIn ? COLORS.success : COLORS.danger }]}>
              {driveSignedIn ? (userInfo?.email || t.driveConnected) : t.driveNotConnected}
            </Text>
          </View>

          {!driveSignedIn ? (
            <PrimaryButton
              title={signingIn ? (isUrdu ? 'سائن ان ہو رہے ہیں…' : 'Signing in…') : t.signIn}
              onPress={handleSignIn}
              loading={signingIn}
              disabled={signingIn}
              icon={<Icon name="logo-google" size={16} color="#fff" />}
            />
          ) : (
            <View style={{ gap: 8 }}>
              <SecondaryButton
                title={isUrdu ? 'ڈیٹا بیس فہرست تازہ کریں' : 'Refresh Database List'}
                onPress={loadDatabases}
                icon={<Icon name="refresh-outline" size={14} color={COLORS.primary} />}
              />
              <SecondaryButton
                title={syncing ? (isUrdu ? 'اپ لوڈ ہو رہا ہے…' : 'Uploading…') : (isUrdu ? 'ڈرائیو پر اپ لوڈ کریں' : 'Upload to Drive')}
                onPress={handleSyncCurrentDb}
                loading={syncing}
                disabled={syncing || !currentDb}
                icon={<Icon name="cloud-upload-outline" size={14} color={COLORS.primary} />}
              />
              <GhostButton title={t.signOut} onPress={handleSignOut} color={COLORS.danger} />
            </View>
          )}

          {driveSignedIn && (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.settingDesc}>
                {isUrdu
                  ? '• ڈرائیو سے ڈیٹا بیس ڈاؤنلوڈ کریں ← ڈیٹا بیس اسکرین پر'
                  : '• Download databases from Drive in the Databases screen'}
              </Text>
              <Text style={styles.settingDesc}>
                {isUrdu
                  ? '• موجودہ ڈیٹا بیس کو اوپر والے بٹن سے Drive پر محفوظ کریں'
                  : '• Upload the current database to Drive with the button above'}
              </Text>
            </View>
          )}
        </Card>

        {/* Logo */}
        <Card>
          <SectionHeader title={isUrdu ? 'کمپنی لوگو' : 'Company Logo'} />
          <View style={styles.logoRow}>
            <View style={styles.logoPreview}>
              {prefs.logoData
                ? <Image source={{ uri: prefs.logoData }} style={{ width: 54, height: 54, borderRadius: RADIUS.sm }} resizeMode="contain" />
                : <Icon name="image-outline" size={28} color={COLORS.textLight} />}
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.settingLabel}>{isUrdu ? 'PDF رپورٹس میں لوگو' : 'Logo for PDF reports'}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <SecondaryButton title={isUrdu ? 'لوگو منتخب کریں' : 'Choose'} onPress={handleChooseLogo} small />
                {prefs.logoData && <GhostButton title={isUrdu ? 'ہٹائیں' : 'Remove'} onPress={handleRemoveLogo} />}
              </View>
            </View>
          </View>
        </Card>

        {/* Databases */}
        <Card>
          <SectionHeader title={isUrdu ? 'ڈیٹا بیس' : 'Databases'} />
          <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('DatabaseSelector')}>
            <Icon name="server-outline" size={18} color={COLORS.primary} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.settingLabel}>{isUrdu ? 'ڈیٹا بیس منتخب کریں' : 'Select / Manage Databases'}</Text>
              <Text style={styles.settingDesc}>{currentDb ? currentDb.replace('.sqlite', '') : t.noDatabaseSelected}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('CreateDatabase')}>
            <Icon name="add-circle-outline" size={18} color={COLORS.success} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.settingLabel}>{t.createNewDb}</Text>
              <Text style={styles.settingDesc}>{isUrdu ? 'نئی کمپنی ڈیٹا بیس بنائیں' : 'Create a fresh company database'}</Text>
            </View>
            <Icon name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        </Card>

        {/* Account Management */}
        <Card>
          <SectionHeader title={isUrdu ? 'اکاؤنٹ مینجمنٹ' : 'Account Management'} />
          {[
            { titleEn: 'Account Manager', titleUr: 'اکاؤنٹ مینیجر',    screen: 'AccountManager', icon: 'people-outline' },
            { titleEn: 'Account Groups',  titleUr: 'اکاؤنٹ گروپس',    screen: 'AccountGroups',  icon: 'layers-outline' },
            { titleEn: 'Voucher Types',   titleUr: 'وصول نامہ اقسام', screen: 'VoucherTypes',   icon: 'pricetag-outline' },
          ].map(item => (
            <TouchableOpacity key={item.screen} style={styles.settingRow} onPress={() => navigation.navigate(item.screen)}>
              <Icon name={item.icon} size={18} color={COLORS.primary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.settingLabel}>{isUrdu ? item.titleUr : item.titleEn}</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={COLORS.textLight} />
            </TouchableOpacity>
          ))}
        </Card>

        {/* App Info */}
        <Card>
          <SectionHeader title={t.appInfo} />
          {[
            [t.version,  APP_VERSION],
            ['Platform', Platform.OS === 'ios' ? 'iOS' : 'Android'],
            ['Engine',   'Flouris ERP v1.0'],
          ].map(([label, value]) => (
            <View key={label} style={styles.infoRow}>
              <Text style={styles.infoLabel}>{label}</Text>
              <Text style={styles.infoValue}>{value}</Text>
            </View>
          ))}
        </Card>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.bg },
  header:          { backgroundColor: COLORS.bg, paddingTop: 50, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:     { color: COLORS.text, fontSize: FONTS.size.xxl, fontWeight: '800' ,textAlign: 'center'},
  headerSub:       { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 2,textAlign: 'center' },
  scroll:          { padding: 16 },
  settingRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, gap: 10 },
  settingInfo:     { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  settingLabel:    { fontSize: FONTS.size.md, fontWeight: '600', color: COLORS.text },
  settingDesc:     { fontSize: FONTS.size.sm, color: COLORS.textMuted, marginTop: 2, lineHeight: 18 },
  driveBanner:     { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.sm, padding: 10, marginBottom: 12, gap: 8 },
  driveOk:         { backgroundColor: '#dcfce7' },
  driveMissing:    { backgroundColor: '#fef2f2' },
  driveStatusText: { fontSize: FONTS.size.sm, fontWeight: '600', flex: 1 },
  logoRow:         { flexDirection: 'row', alignItems: 'center', gap: 14 },
  logoPreview:     { width: 60, height: 60, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.bg },
  langBadge:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.sm, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  langBadgeText:   { fontSize: FONTS.size.sm, fontWeight: '700', color: COLORS.text },
  infoRow:         { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  infoLabel:       { fontSize: FONTS.size.sm, color: COLORS.textMuted },
  infoValue:       { fontSize: FONTS.size.sm, color: COLORS.text, fontWeight: '600' },
});