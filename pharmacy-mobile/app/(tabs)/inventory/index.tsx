import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl, ActivityIndicator, Modal, TouchableOpacity } from 'react-native';
import { colors, spacing, typography, radius } from '../../../lib/theme';
import { getInventory, getInventoryPeek, InventoryItem } from '../../../lib/api';
import SearchBar from '../../../components/SearchBar';
import MedicineRow from '../../../components/MedicineRow';
import Card from '../../../components/Card';
import { Ionicons } from '@expo/vector-icons';

export default function InventoryScreen() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [peekData, setPeekData] = useState<any[] | null>(null);
  const [peekName, setPeekName] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const data = await getInventory();
      setItems(data);
    } catch (e) {
      console.warn('Inventory fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i =>
      i.medicine_name?.toLowerCase().includes(q) ||
      i.batch_no?.toLowerCase().includes(q) ||
      i.rack_location?.toLowerCase().includes(q)
    );
  }, [items, search]);

  const handlePeek = async (item: InventoryItem) => {
    setPeekName(item.medicine_name);
    try {
      const data = await getInventoryPeek(item.medicine_id);
      setPeekData(data);
    } catch {
      setPeekData([]);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search medicine, batch, rack..."
        style={{ marginHorizontal: spacing.md, marginTop: spacing.md }}
      />

      <Text style={styles.countText}>{filtered.length} items</Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item }) => (
          <MedicineRow
            name={item.medicine_name || 'Unknown'}
            batch={item.batch_no}
            quantity={item.quantity}
            expiry={item.expiry_date}
            rack={item.rack_location}
            onPress={() => handlePeek(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="cube-outline" size={48} color={colors.textMuted} />
            <Text style={[typography.bodySmall, { marginTop: spacing.md }]}>No items found</Text>
          </View>
        }
      />

      {/* Peek Modal */}
      <Modal visible={peekData !== null} transparent animationType="slide" onRequestClose={() => setPeekData(null)}>
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={typography.h3}>{peekName}</Text>
              <TouchableOpacity onPress={() => setPeekData(null)}>
                <Ionicons name="close-circle" size={28} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={[typography.label, { marginBottom: spacing.md }]}>BATCH DETAILS</Text>
            {peekData && peekData.length > 0 ? peekData.map((b: any, i: number) => (
              <View key={i} style={styles.peekRow}>
                <Text style={typography.body}>Batch: {b.batch_no || '-'}</Text>
                <Text style={typography.bodySmall}>Qty: {b.quantity} | Exp: {b.expiry_date || '-'}</Text>
                {b.unit_price ? <Text style={typography.bodySmall}>MRP: ₹{b.unit_price} | Cost: ₹{b.cost_price || '-'}</Text> : null}
              </View>
            )) : (
              <Text style={typography.bodySmall}>No batch data available</Text>
            )}
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  countText: { ...typography.caption, marginHorizontal: spacing.md, marginTop: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  modalCard: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: spacing.lg, maxHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  peekRow: { backgroundColor: colors.surfaceLight, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
});
