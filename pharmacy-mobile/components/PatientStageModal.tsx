/**
 * PatientStageModal — Quick Bill popup
 * 4-tap flow: search → tap add → adjust qty → save
 * Short products: OOS items get an "Order" button → pending panel
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  Alert, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, spacing, radius } from '../lib/theme';
import {
  searchMedicine, SearchMedicineResult, createSale,
  getPatientByPhone, PatientRecord, createSpecialOrder,
} from '../lib/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BillRow {
  inventory_id: number;
  medicine_name: string;
  batch_no: string;
  mrp: number;
  qty: number;
  loose_qty: number;
  showLoose: boolean;
}

interface PendingOrder {
  id: number;
  medicine_name: string;
  qty: number;
  requester: string;
  phone: string;
}

function rowTotal(row: BillRow): number {
  return parseFloat((row.qty * row.mrp + row.loose_qty * (row.mrp / 10)).toFixed(2));
}

function isOOS(item: SearchMedicineResult) {
  return item.is_out_of_stock || item.quantity === 0;
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <View style={st.stepper}>
      <TouchableOpacity
        style={[st.stepBtn, value <= min && st.stepBtnDim]}
        onPress={() => onChange(Math.max(min, value - 1))}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      >
        <Ionicons name="remove" size={18} color={value <= min ? colors.textMuted : colors.textPrimary} />
      </TouchableOpacity>
      <Text style={st.stepValue}>{value}</Text>
      <TouchableOpacity
        style={st.stepBtn}
        onPress={() => onChange(value + 1)}
        hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
      >
        <Ionicons name="add" size={18} color={colors.textPrimary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Order confirm mini-card ──────────────────────────────────────────────────

interface OrderConfirmProps {
  item: SearchMedicineResult;
  patientName: string;
  patientPhone: string;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
  loading: boolean;
}

function OrderConfirm({ item, patientName, patientPhone, onConfirm, onCancel, loading }: OrderConfirmProps) {
  const [qty, setQty] = useState(1);
  return (
    <View style={st.orderCard}>
      <View style={st.orderCardHead}>
        <Ionicons name="alert-circle" size={15} color={colors.warning} />
        <Text style={st.orderCardTitle} numberOfLines={1}>Order: {item.medicine_name}</Text>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={st.orderCardBody}>
        <View style={{ flex: 1 }}>
          <Text style={st.orderCardFor}>
            For: {patientName || 'Walk-in'}
          </Text>
          {!!patientPhone && (
            <Text style={st.orderCardPhone}>{patientPhone}</Text>
          )}
        </View>
        <View style={st.orderCardRight}>
          <Text style={st.controlLabel}>QTY</Text>
          <Stepper value={qty} min={1} onChange={setQty} />
        </View>
      </View>
      <TouchableOpacity
        style={st.orderConfirmBtn}
        onPress={() => onConfirm(qty)}
        disabled={loading}
        activeOpacity={0.8}
      >
        {loading
          ? <ActivityIndicator color="#fff" size="small" />
          : <Text style={st.orderConfirmText}>✓ Confirm Special Order</Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: (invoiceNo: string, total: number, patientName: string) => void;
  initialPhone?: string;
  initialName?: string;
}

export default function PatientStageModal({
  visible, onClose, onSaved, initialPhone = '', initialName = '',
}: Props) {
  // Patient
  const [showPatient, setShowPatient] = useState(false);
  const [patientName, setPatientName] = useState(initialName);
  const [patientPhone, setPatientPhone] = useState(initialPhone);
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  // Search
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchMedicineResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<TextInput>(null);

  // Cart
  const [rows, setRows] = useState<BillRow[]>([]);
  const [billDiscount, setBillDiscount] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Short / OOS ordering
  const [orderingItem, setOrderingItem] = useState<SearchMedicineResult | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [pendingExpanded, setPendingExpanded] = useState(true);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setShowPatient(!!initialName || !!initialPhone);
      setPatientName(initialName);
      setPatientPhone(initialPhone);
      setPatient(null);
      setRows([]);
      setQuery('');
      setSuggestions([]);
      setBillDiscount('');
      setOrderingItem(null);
      setPendingOrders([]);
    }
  }, [visible]);

  // Patient phone lookup
  useEffect(() => {
    if (patientPhone.length < 10) { setPatient(null); return; }
    let dead = false;
    const t = setTimeout(async () => {
      setLookingUp(true);
      try {
        const r = await getPatientByPhone(patientPhone);
        if (!dead && r) { setPatient(r); if (r.name && !patientName) setPatientName(r.name); }
      } catch { /* non-fatal */ } finally { if (!dead) setLookingUp(false); }
    }, 700);
    return () => { dead = true; clearTimeout(t); };
  }, [patientPhone]);

  // Medicine search
  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    let dead = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await searchMedicine(query);
        if (!dead) setSuggestions(data.slice(0, 7));
      } catch { if (!dead) setSuggestions([]); }
      finally { if (!dead) setSearching(false); }
    }, 280);
    return () => { dead = true; clearTimeout(t); };
  }, [query]);

  // Cart helpers
  const addRow = useCallback((item: SearchMedicineResult) => {
    setQuery(''); setSuggestions([]); Keyboard.dismiss();
    setRows(prev => {
      const exists = prev.find(r => r.inventory_id === item.inventory_id);
      if (exists) return prev.map(r => r.inventory_id === item.inventory_id ? { ...r, qty: r.qty + 1 } : r);
      return [...prev, { inventory_id: item.inventory_id, medicine_name: item.medicine_name,
        batch_no: item.batch_no || '', mrp: item.mrp || item.unit_price || 0,
        qty: 1, loose_qty: 0, showLoose: false }];
    });
    setTimeout(() => searchRef.current?.focus(), 120);
  }, []);

  const updateRow = useCallback((idx: number, patch: Partial<BillRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }, []);

  const removeRow = useCallback((idx: number) => {
    setRows(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // Place special order
  const handlePlaceOrder = async (qty: number) => {
    if (!orderingItem) return;
    if (!patientName.trim() && !patientPhone.trim()) {
      Alert.alert('Patient needed', 'Please enter at least a name or phone number to place a special order.');
      return;
    }
    setPlacingOrder(true);
    try {
      const res = await createSpecialOrder({
        product: orderingItem.medicine_name,
        requester: patientName || 'Walk-in',
        phone: patientPhone || '0000000000',
        qty,
        priority: 'normal',
      });
      setPendingOrders(prev => [...prev, {
        id: res.id,
        medicine_name: orderingItem.medicine_name,
        qty,
        requester: patientName || 'Walk-in',
        phone: patientPhone,
      }]);
      setOrderingItem(null);
      setPendingExpanded(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not place order');
    } finally {
      setPlacingOrder(false);
    }
  };

  // Totals
  const subtotal = rows.reduce((s, r) => s + rowTotal(r), 0);
  const discPct = parseFloat(billDiscount) || 0;
  const discAmt = parseFloat((subtotal * discPct / 100).toFixed(2));
  const grandTotal = parseFloat((subtotal - discAmt).toFixed(2));

  // Save bill
  const handleSave = async () => {
    if (rows.length === 0) { Alert.alert('Empty', 'Add at least one medicine.'); return; }
    setSubmitting(true);
    try {
      const res = await createSale({
        items: rows.map(r => ({ inventory_id: r.inventory_id, quantity: r.qty, unit_price: r.mrp, loose_qty: r.loose_qty })),
        patient_name: patientName || undefined,
        patient_phone: patientPhone || undefined,
        discount: discAmt,
      });
      onSaved(res.invoice_no, res.total, patientName);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save bill');
    } finally { setSubmitting(false); }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Top bar */}
        <View style={st.topBar}>
          <TouchableOpacity style={[st.patientPill, patient && st.patientPillKnown]}
            onPress={() => setShowPatient(p => !p)} activeOpacity={0.7}>
            <Ionicons name={patient ? 'person-circle' : 'person-circle-outline'} size={16}
              color={patient ? colors.primary : colors.textMuted} />
            <Text style={[st.patientPillText, patient && st.patientPillTextKnown]} numberOfLines={1}>
              {patientName || 'Walk-in'}
            </Text>
            {pendingOrders.length > 0 && (
              <View style={st.pendingBadge}><Text style={st.pendingBadgeText}>{pendingOrders.length}</Text></View>
            )}
            <Ionicons name={showPatient ? 'chevron-up' : 'chevron-down'} size={13} color={colors.textMuted} />
          </TouchableOpacity>
          <Text style={st.topTitle}>Quick Bill</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Patient expand */}
        {showPatient && (
          <View style={st.patientRow}>
            <TextInput style={[st.patientInput, { flex: 2 }]} value={patientName}
              onChangeText={setPatientName} placeholder="Patient name"
              placeholderTextColor={colors.textMuted} returnKeyType="next" />
            <View style={[st.patientInput, st.phoneWrap, { flex: 1.5 }]}>
              <TextInput style={st.phoneInner} value={patientPhone} onChangeText={setPatientPhone}
                placeholder="Mobile" placeholderTextColor={colors.textMuted}
                keyboardType="phone-pad" maxLength={10} />
              {lookingUp ? <ActivityIndicator size="small" color={colors.primary} />
                : patient ? <Ionicons name="checkmark-circle" size={15} color={colors.success} /> : null}
            </View>
          </View>
        )}

        {/* Previous medicines strip */}
        {patient && patient.lastMeds.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={st.lastMedsScroll} contentContainerStyle={st.lastMedsContent}
            keyboardShouldPersistTaps="handled">
            <Text style={st.lastMedsHint}>Previous: </Text>
            {patient.lastMeds.map((m, i) => {
              const inCart = rows.some(r => r.inventory_id === m.inventory_id);
              return (
                <TouchableOpacity key={`${m.inventory_id}-${i}`}
                  style={[st.lastMedChip, inCart && st.lastMedChipDone]} onPress={() => addRow(m)}>
                  <Text style={st.lastMedChipText} numberOfLines={1}>{m.medicine_name}</Text>
                  <Ionicons name={inCart ? 'checkmark' : 'add'} size={11}
                    color={inCart ? colors.primary : colors.textMuted} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <ScrollView style={st.body} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 200 }}>

          {/* Search bar */}
          <View style={st.searchWrap}>
            <Ionicons name="search-outline" size={18} color={colors.textMuted} />
            <TextInput ref={searchRef} style={st.searchInput} value={query}
              onChangeText={setQuery} placeholder="Search medicine…"
              placeholderTextColor={colors.textMuted} autoCorrect={false} returnKeyType="search" />
            {searching
              ? <ActivityIndicator size="small" color={colors.primary} />
              : query.length > 0 && (
                <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); }}>
                  <Ionicons name="close-circle" size={17} color={colors.textMuted} />
                </TouchableOpacity>
              )}
          </View>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <View style={st.suggBox}>
              {suggestions.map(item => {
                const oos = isOOS(item);
                const low = !oos && item.quantity < 10;
                return (
                  <View key={item.inventory_id} style={st.suggRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={st.suggName} numberOfLines={1}>{item.medicine_name}</Text>
                      <Text style={st.suggMeta}>
                        {item.batch_no}{'  ·  '}
                        {oos ? <Text style={{ color: colors.danger }}>Out of stock</Text>
                          : low ? <Text style={{ color: colors.warning }}>⚠ {item.quantity} left</Text>
                          : <Text>Stock: {item.quantity}</Text>}
                        {'  ·  '}₹{item.mrp || item.unit_price}
                      </Text>
                    </View>
                    {oos ? (
                      <TouchableOpacity style={st.oosBtn}
                        onPress={() => { setQuery(''); setSuggestions([]); setOrderingItem(item); }}>
                        <Ionicons name="clipboard-outline" size={13} color={colors.warning} />
                        <Text style={st.oosBtnText}>Order</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={st.addCircle} onPress={() => addRow(item)}>
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* OOS order confirm card */}
          {orderingItem && (
            <View style={{ marginHorizontal: spacing.md, marginBottom: spacing.sm }}>
              <OrderConfirm
                item={orderingItem}
                patientName={patientName}
                patientPhone={patientPhone}
                onConfirm={handlePlaceOrder}
                onCancel={() => setOrderingItem(null)}
                loading={placingOrder}
              />
            </View>
          )}

          {/* Empty hint */}
          {rows.length === 0 && pendingOrders.length === 0 && query.length === 0 && !orderingItem && (
            <View style={st.emptyHint}>
              <Ionicons name="medkit-outline" size={36} color={colors.textMuted} />
              <Text style={st.emptyHintText}>Search and tap a medicine to add it</Text>
            </View>
          )}

          {/* Cart rows */}
          {rows.map((row, idx) => (
            <View key={`${row.inventory_id}-${idx}`} style={st.row}>
              <View style={st.rowHead}>
                <View style={{ flex: 1 }}>
                  <Text style={st.rowName} numberOfLines={1}>{row.medicine_name}</Text>
                  <Text style={st.rowMeta}>{row.batch_no ? `${row.batch_no}  ·  ` : ''}₹{row.mrp}/strip</Text>
                </View>
                <TouchableOpacity onPress={() => removeRow(idx)} hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}>
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </TouchableOpacity>
              </View>
              <View style={st.rowControls}>
                <View style={st.rowControlLeft}>
                  <Text style={st.controlLabel}>STRIPS</Text>
                  <Stepper value={row.qty} min={0}
                    onChange={v => { if (v === 0 && row.loose_qty === 0) removeRow(idx); else updateRow(idx, { qty: v }); }} />
                </View>
                <TouchableOpacity style={[st.looseToggle, row.showLoose && st.looseToggleOn]}
                  onPress={() => updateRow(idx, { showLoose: !row.showLoose })}>
                  <Text style={[st.looseToggleText, row.showLoose && st.looseToggleTextOn]}>
                    {row.showLoose ? 'Hide loose' : '+ Loose'}
                  </Text>
                </TouchableOpacity>
                <Text style={st.rowTotal}>₹{rowTotal(row).toFixed(2)}</Text>
              </View>
              {row.showLoose && (
                <View style={st.looseRow}>
                  <Text style={st.controlLabel}>LOOSE TABLETS</Text>
                  <Stepper value={row.loose_qty} min={0} onChange={v => updateRow(idx, { loose_qty: v })} />
                  <Text style={st.looseNote}>≈₹{(row.mrp / 10).toFixed(1)}/tab</Text>
                </View>
              )}
            </View>
          ))}

          {/* ── Pending special orders panel ── */}
          {pendingOrders.length > 0 && (
            <View style={st.pendingPanel}>
              <TouchableOpacity style={st.pendingHead} onPress={() => setPendingExpanded(e => !e)} activeOpacity={0.7}>
                <Ionicons name="time-outline" size={15} color={colors.warning} />
                <Text style={st.pendingHeadTitle}>Pending Orders</Text>
                <View style={st.pendingCountChip}><Text style={st.pendingCountText}>{pendingOrders.length}</Text></View>
                <Ionicons name={pendingExpanded ? 'chevron-up' : 'chevron-down'} size={14}
                  color={colors.warning} style={{ marginLeft: 'auto' as any }} />
              </TouchableOpacity>
              {pendingExpanded && pendingOrders.map((o, i) => (
                <View key={o.id} style={[st.pendingRow, i === pendingOrders.length - 1 && { borderBottomWidth: 0 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={st.pendingRowName} numberOfLines={1}>{o.medicine_name}</Text>
                    <Text style={st.pendingRowMeta}>{o.requester}{o.phone ? ` · ${o.phone}` : ''}</Text>
                  </View>
                  <Text style={st.pendingRowQty}>×{o.qty}</Text>
                  <View style={st.pendingStatusChip}><Text style={st.pendingStatusText}>Ordered</Text></View>
                </View>
              ))}
            </View>
          )}

          {/* Bill footer */}
          {rows.length > 0 && (
            <View style={st.footer}>
              <View style={st.discountRow}>
                <Text style={st.footerLabel}>Discount %</Text>
                <View style={st.discountInput}>
                  <TextInput style={st.discountText} value={billDiscount}
                    onChangeText={v => { const c = v.replace(/[^0-9.]/g, ''); const n = parseFloat(c);
                      if (!c || (!isNaN(n) && n <= 100)) setBillDiscount(c); }}
                    keyboardType="decimal-pad" placeholder="0"
                    placeholderTextColor={colors.textMuted} selectTextOnFocus maxLength={5} />
                  <Text style={st.discountPct}>%</Text>
                </View>
              </View>
              {discAmt > 0 && (
                <>
                  <View style={st.summLine}>
                    <Text style={st.summLabel}>Subtotal</Text>
                    <Text style={st.summValue}>₹{subtotal.toFixed(2)}</Text>
                  </View>
                  <View style={st.summLine}>
                    <Text style={st.summLabel}>Discount ({discPct}%)</Text>
                    <Text style={[st.summValue, { color: colors.success }]}>−₹{discAmt.toFixed(2)}</Text>
                  </View>
                </>
              )}
              <View style={[st.summLine, st.summTotal]}>
                <Text style={st.summTotalLabel}>Total</Text>
                <Text style={st.summTotalAmt}>₹{grandTotal.toFixed(2)}</Text>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Save bar */}
        {rows.length > 0 && (
          <View style={st.saveBar}>
            <View>
              <Text style={st.saveBarMeta}>{rows.length} item{rows.length !== 1 ? 's' : ''}</Text>
              <Text style={st.saveBarTotal}>₹{grandTotal.toFixed(2)}</Text>
              {patientName ? <Text style={st.saveBarPatient}>{patientName}</Text> : null}
            </View>
            <TouchableOpacity onPress={handleSave} disabled={submitting} activeOpacity={0.85}>
              <LinearGradient colors={[colors.primary, colors.primaryDark]} style={st.saveBtn}>
                {submitting ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="checkmark-circle-outline" size={21} color="#fff" />
                    <Text style={st.saveBtnText}>Save Bill</Text></>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? spacing.lg : spacing.md,
    paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 8 },
  patientPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surfaceLight,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 155,
    borderWidth: 1, borderColor: colors.cardBorder },
  patientPillKnown: { borderColor: 'rgba(108,99,255,0.35)', backgroundColor: 'rgba(108,99,255,0.08)' },
  patientPillText: { fontSize: 12, color: colors.textMuted, fontWeight: '500', flex: 1 },
  patientPillTextKnown: { color: colors.primary },
  pendingBadge: { backgroundColor: colors.warning, borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  pendingBadgeText: { fontSize: 10, fontWeight: '700', color: '#000' },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  patientRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.md, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.divider, backgroundColor: colors.surface },
  patientInput: { backgroundColor: colors.surfaceElevated, borderRadius: radius.md,
    paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.cardBorder },
  phoneWrap: { flexDirection: 'row', alignItems: 'center', paddingVertical: 0 },
  phoneInner: { flex: 1, color: colors.textPrimary, fontSize: 14, paddingVertical: 9 },
  lastMedsScroll: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  lastMedsContent: { alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 8, gap: 6 },
  lastMedsHint: { fontSize: 11, color: colors.textMuted },
  lastMedChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surfaceLight,
    borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: colors.cardBorder },
  lastMedChipDone: { borderColor: 'rgba(108,99,255,0.4)', backgroundColor: 'rgba(108,99,255,0.07)' },
  lastMedChipText: { fontSize: 12, color: colors.textSecondary, maxWidth: 110 },
  body: { flex: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, margin: spacing.md,
    backgroundColor: colors.surfaceLight, borderRadius: radius.md, paddingHorizontal: 12,
    paddingVertical: 11, borderWidth: 1, borderColor: colors.cardBorder },
  searchInput: { flex: 1, fontSize: 15, color: colors.textPrimary },
  suggBox: { marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cardBorder, overflow: 'hidden', marginBottom: spacing.sm },
  suggRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md,
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 10 },
  suggName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  suggMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  addCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center' },
  oosBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)' },
  oosBtnText: { fontSize: 12, fontWeight: '700', color: colors.warning },
  orderCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)', overflow: 'hidden' },
  orderCardHead: { flexDirection: 'row', alignItems: 'center', gap: 7,
    padding: 10, backgroundColor: 'rgba(245,158,11,0.07)',
    borderBottomWidth: 1, borderBottomColor: 'rgba(245,158,11,0.15)' },
  orderCardTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  orderCardBody: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  orderCardFor: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  orderCardPhone: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  orderCardRight: { alignItems: 'center', gap: 4 },
  orderConfirmBtn: { margin: 10, marginTop: 0, backgroundColor: colors.warning,
    borderRadius: radius.sm, paddingVertical: 10, alignItems: 'center' },
  orderConfirmText: { fontSize: 13, fontWeight: '700', color: '#000' },
  emptyHint: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyHintText: { fontSize: 13, color: colors.textMuted },
  row: { marginHorizontal: spacing.md, marginBottom: 10, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, gap: 6 },
  rowName: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  rowMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  rowControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowControlLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  controlLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted,
    letterSpacing: 0.5, textTransform: 'uppercase' },
  rowTotal: { marginLeft: 'auto' as any, fontSize: 15, fontWeight: '700', color: colors.accent },
  looseToggle: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.cardBorder },
  looseToggleOn: { borderColor: 'rgba(108,99,255,0.4)', backgroundColor: 'rgba(108,99,255,0.09)' },
  looseToggleText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  looseToggleTextOn: { color: colors.primary },
  looseRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10,
    paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider },
  looseNote: { fontSize: 11, color: colors.textMuted, marginLeft: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.cardBorder },
  stepBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceElevated },
  stepBtnDim: { opacity: 0.35 },
  stepValue: { minWidth: 32, textAlign: 'center', fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  pendingPanel: { marginHorizontal: spacing.md, marginBottom: 10, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', overflow: 'hidden' },
  pendingHead: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 11,
    backgroundColor: 'rgba(245,158,11,0.07)', borderBottomWidth: 1,
    borderBottomColor: 'rgba(245,158,11,0.15)' },
  pendingHeadTitle: { fontSize: 13, fontWeight: '700', color: colors.warning },
  pendingCountChip: { backgroundColor: colors.warning, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1 },
  pendingCountText: { fontSize: 10, fontWeight: '700', color: '#000' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 8 },
  pendingRowName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  pendingRowMeta: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  pendingRowQty: { fontSize: 13, color: colors.textSecondary, marginRight: 4 },
  pendingStatusChip: { backgroundColor: 'rgba(108,99,255,0.12)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(108,99,255,0.25)' },
  pendingStatusText: { fontSize: 10, fontWeight: '700', color: colors.primary },
  footer: { marginHorizontal: spacing.md, marginTop: 6, backgroundColor: colors.surface,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder, padding: 14, gap: 8 },
  discountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerLabel: { fontSize: 14, color: colors.textSecondary },
  discountInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceElevated,
    borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.cardBorder, minWidth: 72, justifyContent: 'center' },
  discountText: { fontSize: 16, fontWeight: '700', color: colors.textPrimary,
    textAlign: 'center', minWidth: 36 },
  discountPct: { fontSize: 14, color: colors.textMuted, marginLeft: 2 },
  summLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summLabel: { fontSize: 13, color: colors.textSecondary },
  summValue: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  summTotal: { paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.divider, marginTop: 4 },
  summTotalLabel: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  summTotalAmt: { fontSize: 22, fontWeight: '800', color: colors.accent },
  saveBar: { position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider,
    paddingHorizontal: spacing.md, paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 30 : 14 },
  saveBarMeta: { fontSize: 11, color: colors.textMuted },
  saveBarTotal: { fontSize: 24, fontWeight: '800', color: colors.accent, lineHeight: 28 },
  saveBarPatient: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 22, borderRadius: radius.md },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
