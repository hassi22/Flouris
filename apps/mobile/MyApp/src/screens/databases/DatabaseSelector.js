/**
 * Database Selector Screen — Flouris ERP Mobile (bare RN)
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useLang } from '../../context/LanguageContext';
import { useDatabase } from '../../context/DatabaseContext';
import { downloadDatabaseFromDrive } from '../../services/googleDriveService';
import {
  PrimaryButton, SecondaryButton, Toast, EmptyState, Card,
} from '../../components/SharedComponents';
import { COLORS, FONTS, RADIUS, SHADOW } from '../../components/theme';

export default function DatabaseSelector() {
  const { t, isUrdu } = useLang();
  const navigation = useNavigation();
  const {
    databases, currentDb, selectDatabase, loadDatabases,
    showNotification, notification, driveSignedIn,
  } = useDatabase();

  const [refreshing,  setRefreshing]  = useState(false);
  const [downloading, setDownloading] = useState(null);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDatabases();
    setRefreshing(false);
  }, [loadDatabases]);

  const handleSelect = async (db) => {
    if (db.source === 'google-drive') {
      Alert.alert(
        isUrdu ? 'ڈرائیو سے ڈاؤنلوڈ' : 'Download from Drive',
        isUrdu ? `${db.name} ڈیٹا بیس ڈاؤنلوڈ کریں?` : `Download ${db.name} to device?`,
        [
          { text: isUrdu ? 'منسوخ' : 'Cancel', style: 'cancel' },
          {
            text: isUrdu ? 'ڈاؤنلوڈ' : 'Download',
            onPress: async () => {
              setDownloading(db.id);
              const result = await downloadDatabaseFromDrive(db.id, db.filename);
              setDownloading(null);
              if (result.success) {
                showNotification(isUrdu ? 'ڈاؤنلوڈ مکمل' : 'Download complete', 'success');
                await loadDatabases();
                // Downloading it is the same intent as selecting it — actually
                // open it now instead of leaving the user to find and tap the
                // newly-appeared local copy separately.
                await selectDatabase(db.filename);
                navigation.goBack();
              } else {
                showNotification(result.error || 'Download failed', 'error');
              }
            },
          },
        ]
      );
    } else {
      await selectDatabase(db.filename || db.name + '.sqlite');
      navigation.goBack();
    }
  };

  const local = databases.filter(d => d.source === 'local');
  const drive = databases.filter(d => d.source === 'google-drive');

  const renderDb = (item) => {
    const isActive  = currentDb === (item.filename || item.name + '.sqlite');
    const isDrive   = item.source === 'google-drive';
    const isLoading = downloading === item.id;

    return (
      <TouchableOpacity
        style={[styles.dbCard, isActive && styles.dbCardActive]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.8}
      >
        <View style={[styles.dbIconWrap, isDrive && { backgroundColor: '#4285f415' }]}>
          <Icon name={isDrive ? 'logo-google' : 'server-outline'} size={20}
            color={isDrive ? '#4285f4' : COLORS.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.dbName, isActive && { color: COLORS.primary }]}>{item.name}</Text>
          <Text style={styles.dbMeta}>
            {isDrive ? '☁ Google Drive' : '📱 Local'}
            {item.modified ? `  •  ${new Date(item.modified).toLocaleDateString()}` : ''}
            {item.size ? `  •  ${(Number(item.size) / 1024).toFixed(0)} KB` : ''}
          </Text>
        </View>
        {isActive && !isDrive && (
          <Icon name="checkmark-circle" size={18} color={COLORS.primary} />
        )}
        {isDrive && !isActive && (
          isLoading
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Icon name="cloud-download-outline" size={18} color={COLORS.textMuted} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Toast notification={notification} />

      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t.databases}</Text>
          <Text style={styles.headerSub}>{databases.length} {isUrdu ? 'ڈیٹا بیسز دستیاب' : 'databases available'}</Text>
        </View>
        <SecondaryButton
          title={isUrdu ? 'تازہ کریں' : 'Refresh'}
          onPress={handleRefresh}
          small
          icon={<Icon name="refresh-outline" size={14} color={COLORS.primary} />}
        />
      </View>

      <FlatList
        data={[]}
        renderItem={null}
        ListHeaderComponent={
          <View style={{ padding: 16 }}>
            {/* Local DBs */}
            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <Icon name="phone-portrait-outline" size={14} color={COLORS.textMuted} />
                <Text style={styles.sectionLabel}>{isUrdu ? 'مقامی ڈیٹا بیسز' : 'Local Databases'}</Text>
              </View>
              {local.length === 0
                ? <Text style={styles.emptySection}>{isUrdu ? 'کوئی مقامی ڈیٹا بیس نہیں' : 'No local databases'}</Text>
                : local.map((db, i) => <View key={i} style={{ marginBottom: 6 }}>{renderDb(db)}</View>)
              }
            </View>

            {/* Create New */}
            <TouchableOpacity style={styles.newDbBtn} onPress={() => navigation.navigate('CreateDatabase')}>
              <Icon name="add-circle-outline" size={18} color={COLORS.success} />
              <Text style={styles.newDbText}>{t.createNewDb}</Text>
            </TouchableOpacity>

            {/* Drive DBs */}
            {driveSignedIn && (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <Icon name="logo-google" size={14} color='#4285f4' />
                  <Text style={styles.sectionLabel}>{isUrdu ? 'گوگل ڈرائیو ڈیٹا بیسز' : 'Google Drive Databases'}</Text>
                </View>
                {drive.length === 0
                  ? <Text style={styles.emptySection}>{isUrdu ? 'ڈرائیو میں کوئی ڈیٹا بیس نہیں' : 'No databases on Drive yet'}</Text>
                  : drive.map((db, i) => <View key={i} style={{ marginBottom: 6 }}>{renderDb(db)}</View>)
                }
              </View>
            )}

            {!driveSignedIn && (
              <Card style={styles.driveCard}>
                <Icon name="cloud-offline-outline" size={24} color={COLORS.textMuted} />
                <Text style={styles.driveCardText}>
                  {isUrdu
                    ? 'گوگل ڈرائیو سے جڑنے کے لیے ترتیبات میں جائیں'
                    : 'Sign in to Google Drive in Settings to access cloud databases'}
                </Text>
                <PrimaryButton title={isUrdu ? 'ترتیبات' : 'Go to Settings'}
                  onPress={() => navigation.navigate('Settings')} small />
              </Card>
            )}
            <View style={{ height: 40 }} />
          </View>
        }
        refreshing={refreshing}
        onRefresh={handleRefresh}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: COLORS.bg },
  header:       { backgroundColor: COLORS.bg, paddingTop: 18, paddingBottom: 16, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTitle:  { color: COLORS.text, fontSize: FONTS.size.xl, fontWeight: '800' },
  headerSub:    { color: COLORS.textMuted, fontSize: FONTS.size.sm, marginTop: 2 },
  section:      { marginBottom: 16 },
  sectionHead:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionLabel: { fontSize: FONTS.size.sm, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptySection: { fontSize: FONTS.size.sm, color: COLORS.textLight, paddingVertical: 8, paddingLeft: 8 },
  dbCard:       { backgroundColor: COLORS.glass, borderRadius: RADIUS.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, ...SHADOW.sm, borderWidth: 1, borderColor: COLORS.glassBorder },
  dbCardActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '05' },
  dbIconWrap:   { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center' },
  dbName:       { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.text },
  dbMeta:       { fontSize: FONTS.size.xs, color: COLORS.textMuted, marginTop: 2 },
  newDbBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.success + '10', borderRadius: RADIUS.md, padding: 12, marginBottom: 16, borderWidth: 1.5, borderColor: COLORS.success + '30' },
  newDbText:    { fontSize: FONTS.size.md, fontWeight: '700', color: COLORS.success },
  driveCard:    { alignItems: 'center', gap: 10, padding: 20 },
  driveCardText:{ fontSize: FONTS.size.sm, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});