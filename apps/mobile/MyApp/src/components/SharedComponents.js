/**
 * SharedComponents.js — Flouris ERP Mobile (bare RN)
 * Reusable UI primitives used across all screens.
 * Icons provided by react-native-vector-icons/Ionicons.
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  TextInput, Modal, Pressable, Animated,
} from 'react-native';
import { COLORS, FONTS, RADIUS, SHADOW } from './theme';

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style, ...props }) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
export function SectionHeader({ title, subtitle, right }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function ScrollHeader({ children, scrollY }) {
  const opacity = scrollY.interpolate({ inputRange: [0, 90], outputRange: [1, 0.72], extrapolate: 'clamp' });
  const translateY = scrollY.interpolate({ inputRange: [0, 90], outputRange: [0, -4], extrapolate: 'clamp' });
  return <Animated.View style={[styles.scrollHeader, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

// ── Primary Button ────────────────────────────────────────────────────────────
export function PrimaryButton({ title, onPress, loading, disabled, icon, style, small }) {
  return (
    <TouchableOpacity
      style={[styles.primaryBtn, small && styles.primaryBtnSm, (disabled || loading) && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator size="small" color="#fff" />
        : <>
            {icon && <View style={{ marginRight: 6 }}>{icon}</View>}
            <Text style={[styles.primaryBtnText, small && { fontSize: FONTS.size.sm }]}>{title}</Text>
          </>}
    </TouchableOpacity>
  );
}

// ── Secondary Button ──────────────────────────────────────────────────────────
export function SecondaryButton({ title, onPress, disabled, icon, style, small }) {
  return (
    <TouchableOpacity
      style={[styles.secondaryBtn, small && styles.secondaryBtnSm, disabled && styles.btnDisabled, style]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
    >
      {icon && <View style={{ marginRight: 6 }}>{icon}</View>}
      <Text style={[styles.secondaryBtnText, small && { fontSize: FONTS.size.sm }]}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── Ghost / Text Button ───────────────────────────────────────────────────────
export function GhostButton({ title, onPress, disabled, style, color }) {
  return (
    <TouchableOpacity style={[styles.ghostBtn, style]} onPress={onPress} disabled={disabled}>
      <Text style={[styles.ghostBtnText, color && { color }]}>{title}</Text>
    </TouchableOpacity>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, value, onChangeText, placeholder, multiline, keyboardType, style, right, editable = true, isUrdu }) {
  return (
    <View style={styles.inputWrapper}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={[styles.inputRow, !editable && styles.inputDisabled]}>
        <TextInput
          style={[styles.input, multiline && { height: 72, textAlignVertical: 'top' }, style, isUrdu && { textAlign: 'right' }]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textLight}
          multiline={multiline}
          keyboardType={keyboardType}
          editable={editable}
        />
        {right}
      </View>
    </View>
  );
}

// ── Select Row ────────────────────────────────────────────────────────────────
export function SelectRow({ label, value, onPress, placeholder, isUrdu }) {
  return (
    <TouchableOpacity style={styles.selectRow} onPress={onPress}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <View style={styles.selectInner}>
        <Text style={[styles.selectText, !value && { color: COLORS.textLight }, isUrdu && { textAlign: 'right' }]} numberOfLines={1}>
          {value || placeholder || 'Select…'}
        </Text>
        <Text style={styles.selectChevron}>▼</Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, color, icon, onPress }) {
  const Wrap = onPress ? TouchableOpacity : View;
  return (
    <Wrap style={styles.statCard} onPress={onPress} activeOpacity={0.85}>
      {icon && <View style={[styles.statIcon, color && { backgroundColor: color + '20' }]}>{icon}</View>}
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color && { color }]}>{value}</Text>
    </Wrap>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ title, subtitle, icon }) {
  return (
    <View style={styles.emptyState}>
      {icon && <View style={styles.emptyIcon}>{icon}</View>}
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

// ── Loading Overlay ───────────────────────────────────────────────────────────
export function LoadingOverlay({ visible, message }) {
  if (!visible) return null;
  return (
    <View style={styles.loadingOverlay}>
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        {message ? <Text style={styles.loadingText}>{message}</Text> : null}
      </View>
    </View>
  );
}

// ── Toast / Notification ──────────────────────────────────────────────────────
export function Toast({ notification }) {
  if (!notification) return null;
  const bg = {
    success: COLORS.success,
    error:   COLORS.danger,
    warning: COLORS.warning,
    info:    COLORS.info,
  }[notification.type] || COLORS.info;
  return (
    <View style={[styles.toast, { backgroundColor: bg }]}>
      <Text style={styles.toastText}>{notification.message}</Text>
    </View>
  );
}

// ── Table Row ─────────────────────────────────────────────────────────────────
export function TableRow({ cells, isHeader, isGroup, isSub, isTotal, isGrand }) {
  const rowStyle = isHeader ? styles.tableHeader
    : isGrand  ? styles.tableGrand
    : isTotal  ? styles.tableTotal
    : isGroup  ? styles.tableGroup
    : isSub    ? styles.tableSub
    : styles.tableRow;

  return (
    <View style={[styles.tableRowBase, rowStyle]}>
      {cells.map((cell, i) => (
        <Text
          key={i}
          style={[
            styles.tableCell,
            isHeader && styles.tableCellHeader,
            isGrand  && styles.tableCellGrand,
            cell.align === 'right' && styles.tableCellRight,
            cell.color && { color: cell.color },
            cell.flex  && { flex: cell.flex },
            cell.width && { width: cell.width },
            cell.style,
          ]}
          numberOfLines={cell.lines || 1}
        >
          {cell.text}
        </Text>
      ))}
    </View>
  );
}

// ── Confirm Modal ─────────────────────────────────────────────────────────────
export function ConfirmModal({ visible, title, message, onConfirm, onCancel, confirmLabel, cancelLabel, danger }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <Pressable style={styles.confirmBox}>
          <Text style={styles.confirmTitle}>{title}</Text>
          {message ? <Text style={styles.confirmMsg}>{message}</Text> : null}
          <View style={styles.confirmBtns}>
            <GhostButton title={cancelLabel || 'Cancel'} onPress={onCancel} />
            <PrimaryButton
              title={confirmLabel || 'Confirm'}
              onPress={onConfirm}
              style={danger ? { backgroundColor: COLORS.danger } : undefined}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Filter Bar ────────────────────────────────────────────────────────────────
export function FilterBar({ children, style }) {
  return (
    <View style={[styles.filterBar, style]}>
      {children}
    </View>
  );
}

// ── Page Header ───────────────────────────────────────────────────────────────
export function PageHeader({ title, subtitle, right, isUrdu }) {
  return (
    <View style={[styles.pageHeader, isUrdu && { alignItems: 'flex-end' }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageTitle}>{title}</Text>
        {subtitle ? <Text style={styles.pageSubtitle}>{subtitle}</Text> : null}
      </View>
      {right && <View style={styles.pageHeaderRight}>{right}</View>}
    </View>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ label, color }) {
  return (
    <View style={[styles.badge, color && { backgroundColor: color + '20', borderColor: color }]}>
      <Text style={[styles.badgeText, color && { color }]}>{label}</Text>
    </View>
  );
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  scrollHeader: { backgroundColor: COLORS.glass, borderBottomWidth: 1, borderBottomColor: COLORS.glassBorder, ...SHADOW.sm },
  card: { backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: RADIUS.lg, padding: 16, marginBottom: 12, ...SHADOW.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, marginTop: 6 },
  sectionTitle:    { fontSize: FONTS.size.lg, fontWeight: '700', color: COLORS.text },
  sectionSubtitle: { fontSize: FONTS.size.sm, color: COLORS.textMuted, marginTop: 2 },

  primaryBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 11, paddingHorizontal: 18, justifyContent: 'center' },
  primaryBtnSm:   { paddingVertical: 7, paddingHorizontal: 12 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: FONTS.size.md },
  secondaryBtn:     { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.glass, borderRadius: RADIUS.md, paddingVertical: 11, paddingHorizontal: 18, justifyContent: 'center', borderWidth: 1, borderColor: COLORS.primary },
  secondaryBtnSm:   { paddingVertical: 7, paddingHorizontal: 12 },
  secondaryBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: FONTS.size.md },
  ghostBtn:      { padding: 8 },
  ghostBtnText:  { color: COLORS.primary, fontWeight: '600', fontSize: FONTS.size.md },
  btnDisabled:   { opacity: 0.5 },

  inputWrapper:  { marginBottom: 12 },
  inputLabel:    { fontSize: FONTS.size.sm, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  inputRow:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: RADIUS.md, backgroundColor: COLORS.glass },
  inputDisabled: { backgroundColor: COLORS.borderLight },
  input:         { flex: 1, paddingVertical: 9, paddingHorizontal: 12, fontSize: FONTS.size.md, color: COLORS.text },

  selectRow:    { marginBottom: 12 },
  selectInner:  { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: RADIUS.md, backgroundColor: COLORS.glass, paddingHorizontal: 12, paddingVertical: 9 },
  selectText:   { flex: 1, fontSize: FONTS.size.md, color: COLORS.text },
  selectChevron:{ color: COLORS.textMuted, fontSize: 10 },

  statCard:  { flex: 1, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: RADIUS.lg, padding: 14, alignItems: 'center', ...SHADOW.sm },
  statIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8, backgroundColor: COLORS.primary + '20' },
  statLabel: { fontSize: FONTS.size.xs, color: COLORS.textMuted, marginBottom: 4, textAlign: 'center' },
  statValue: { fontSize: FONTS.size.lg, fontWeight: '700', color: COLORS.text, textAlign: 'center' },

  emptyState:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon:     { marginBottom: 16, opacity: 0.4 },
  emptyTitle:    { fontSize: FONTS.size.lg, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  emptySubtitle: { fontSize: FONTS.size.sm, color: COLORS.textLight, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  loadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  loadingBox:     { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', ...SHADOW.lg },
  loadingText:    { marginTop: 12, color: COLORS.text, fontSize: FONTS.size.md },

  toast:     { position: 'absolute', top: 60, left: 16, right: 16, borderRadius: RADIUS.md, paddingVertical: 12, paddingHorizontal: 16, zIndex: 1000 },
  toastText: { color: '#fff', fontWeight: '600', fontSize: FONTS.size.md, textAlign: 'center' },

  tableRowBase:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5 },
  tableHeader:      { backgroundColor: COLORS.primary },
  tableGroup:       { backgroundColor: COLORS.groupRow },
  tableSub:         { backgroundColor: COLORS.subRow },
  tableTotal:       { backgroundColor: COLORS.subRow, borderTopWidth: 2, borderTopColor: COLORS.accent },
  tableGrand:       { backgroundColor: COLORS.primary },
  tableRow:         { borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  tableCell:        { flex: 1, fontSize: FONTS.size.sm, color: COLORS.text, paddingHorizontal: 3 },
  tableCellHeader:  { color: '#fff', fontWeight: '700', fontSize: 11 },
  tableCellGrand:   { color: '#fff', fontWeight: '700' },
  tableCellRight:   { textAlign: 'right' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  confirmBox:   { backgroundColor: COLORS.surface, borderRadius: RADIUS.xl, padding: 24, width: '85%', ...SHADOW.lg },
  confirmTitle: { fontSize: FONTS.size.xl, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  confirmMsg:   { fontSize: FONTS.size.md, color: COLORS.textMuted, marginBottom: 20, lineHeight: 22 },
  confirmBtns:  { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },

  filterBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, backgroundColor: COLORS.glass, borderWidth: 1, borderColor: COLORS.glassBorder, borderRadius: RADIUS.lg, padding: 10, marginBottom: 10, ...SHADOW.sm },

  pageHeader:      { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 50, paddingBottom: 8 },
  pageTitle:       { fontSize: FONTS.size.xxl, fontWeight: '800', color: COLORS.text },
  pageSubtitle:    { fontSize: FONTS.size.sm, color: COLORS.textMuted, marginTop: 2 },
  pageHeaderRight: { marginLeft: 8 },

  badge:     { borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.bg },
  badgeText: { fontSize: FONTS.size.xs, fontWeight: '600', color: COLORS.textMuted },

  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 8 },
});
