import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { colors, spacing, typography, radius, shadows } from '../../lib/theme';
import { getDashboard, searchMedicine, SearchMedicineResult } from '../../lib/api';
import DrawerMenu from '../../components/DrawerMenu';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  actions?: { label: string; route?: string }[];
  products?: SearchMedicineResult[];
}

export default function AssistantScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView>(null);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      sender: 'assistant',
      text: 'Hello! I am your Pharmacy Genius Assistant. How can I help you manage the pharmacy today?',
      timestamp: new Date(),
    },
  ]);

  const suggestionChips = [
    { label: 'Find ONDEM 🔍', value: 'find ONDEM' },
    { label: 'Create Bill 🧾', value: 'billing' },
    { label: 'AI Camera 📸', value: 'camera' },
    { label: 'Low Stock ⚠️', value: 'lowstock' },
    { label: 'Send Alert 🔔', value: 'notify' },
  ];

  // Auto-scroll to bottom of chat
  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const triggerLocalNotification = async () => {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Pharmacy Alert 🔔',
        body: 'This is a test push notification from your Pharmacy Genius Assistant!',
        data: { screen: 'Dashboard' },
      },
      trigger: { seconds: 1 },
    });
  };

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMessage: Message = {
      id: Math.random().toString(),
      sender: 'user',
      text: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    // Simulate AI thinking and responsive action logic
    setTimeout(async () => {
      let replyText = "I'm not sure how to handle that request. Try selecting one of the quick actions below!";
      let actions: Message['actions'] = [];
      let products: SearchMedicineResult[] | undefined = undefined;
      const cleanText = textToSend.toLowerCase().trim();

      // Check if it's a product search query (e.g., "find ...", "search ...", or user types medicine name)
      if (cleanText.startsWith('find ') || cleanText.startsWith('search ') || cleanText.includes('ondem') || cleanText.includes('amoxicillin')) {
        const query = cleanText.replace(/^(find|search)\s+/, '');
        try {
          const results = await searchMedicine(query);
          if (results && results.length > 0) {
            replyText = `I found ${results.length} matches in the inventory for "${query}":`;
            products = results;
          } else {
            replyText = `I couldn't find any products matching "${query}" in stock.`;
          }
        } catch (err) {
          replyText = `Error searching for "${query}". Make sure the backend is active.`;
        }
      } else if (cleanText.includes('bill') || cleanText.includes('sale') || cleanText === 'billing') {
        replyText = 'Ready to create a new customer invoice! Click the button below to open the billing counter.';
        actions = [{ label: 'Open POS Billing 🧾', route: '/(tabs)/billing' }];
      } else if (cleanText.includes('camera') || cleanText.includes('photo') || cleanText.includes('scan')) {
        replyText = 'You can capture packaging photos to verify batches or scan invoices using our AI Camera.';
        actions = [{ label: 'Launch AI Camera 📸', route: '/camera' }];
      } else if (cleanText.includes('stock') || cleanText.includes('inventory') || cleanText === 'lowstock') {
        try {
          const dashData = await getDashboard();
          replyText = `I checked the database: There are currently ${dashData.lowStock} products marked as Low Stock.`;
          actions = [{ label: 'View Inventory 📦', route: '/(tabs)/inventory' }];
        } catch (err) {
          replyText = 'There are some items running low in the inventory. Click below to inspect.';
          actions = [{ label: 'View Inventory 📦', route: '/(tabs)/inventory' }];
        }
      } else if (cleanText.includes('notify') || cleanText.includes('alert') || cleanText.includes('push')) {
        replyText = 'Sending a test notification to your device now...';
        await triggerLocalNotification();
      } else if (cleanText.includes('backup') || cleanText.includes('save db')) {
        replyText = 'Initializing secure database backup. This will save a dump of your transactions and inventory.';
        actions = [{ label: 'Trigger Database Backup 💾', route: '/backup' }];
      } else if (cleanText.includes('hi') || cleanText.includes('hello')) {
        replyText = 'Hello there! Let me know if you need to create a bill, check stock levels, or search for products.';
      }

      const assistantMessage: Message = {
        id: Math.random().toString(),
        sender: 'assistant',
        text: replyText,
        timestamp: new Date(),
        actions,
        products,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setLoading(false);
    }, 800);
  };

  const handleAction = (action: { label: string; route?: string }) => {
    if (action.route) {
      router.push(action.route as any);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.leftHeader}>
          <TouchableOpacity onPress={() => setDrawerOpen(true)} style={styles.menuBtn}>
            <Ionicons name="menu-outline" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.assistantStatus}>
            <View style={styles.onlineDot} />
            <View>
              <Text style={styles.assistantTitle}>Pharmacy Genius AI</Text>
              <Text style={styles.assistantSubtitle}>Always active & ready</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity style={styles.clearBtn} onPress={() => setMessages([messages[0]])}>
          <Ionicons name="trash-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Drawer navigation */}
      <DrawerMenu isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Messages */}
      <ScrollView
        ref={scrollViewRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            style={[
              styles.messageRow,
              msg.sender === 'user' ? styles.userRow : styles.assistantRow,
            ]}
          >
            {msg.sender === 'assistant' && (
              <View style={styles.avatar}>
                <Ionicons name="sparkles" size={16} color="#fff" />
              </View>
            )}
            <View
              style={[
                styles.bubble,
                msg.sender === 'user' ? styles.userBubble : styles.assistantBubble,
                msg.products ? { width: '90%', maxWidth: '90%' } : null,
              ]}
            >
              <Text style={styles.messageText}>{msg.text}</Text>

              {/* Products search Carousel inside chat bubble */}
              {msg.products && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.carousel}
                  contentContainerStyle={styles.carouselContent}
                >
                  {msg.products.map((item, index) => (
                    <View key={index} style={styles.productCard}>
                      <Text style={styles.productName} numberOfLines={1}>{item.medicine_name}</Text>
                      <Text style={styles.productDetail}>Batch: {item.batch_no}</Text>
                      <Text style={styles.productDetail}>Exp: {item.expiry_date}</Text>
                      <Text style={styles.productDetail}>Stock: {item.quantity}</Text>
                      <Text style={styles.productPrice}>₹{Number(item.mrp).toFixed(2)}</Text>
                      <TouchableOpacity
                        style={styles.cardActionBtn}
                        onPress={() => router.push('/(tabs)/billing')}
                      >
                        <Text style={styles.cardActionBtnText}>Add to Bill</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              )}

              {msg.actions && msg.actions.map((act, i) => (
                <TouchableOpacity
                  key={i}
                  style={styles.actionBtn}
                  onPress={() => handleAction(act)}
                >
                  <Text style={styles.actionBtnText}>{act.label}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.timeText}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          </View>
        ))}
        {loading && (
          <View style={[styles.messageRow, styles.assistantRow]}>
            <View style={styles.avatar}>
              <ActivityIndicator size="small" color="#fff" />
            </View>
            <View style={[styles.bubble, styles.assistantBubble, { minWidth: 60, alignItems: 'center' }]}>
              <Text style={styles.messageText}>Thinking...</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Quick Chips suggestions */}
      <View style={styles.chipsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
          {suggestionChips.map((chip, index) => (
            <TouchableOpacity
              key={index}
              style={styles.chip}
              onPress={() => handleSend(chip.value)}
            >
              <Text style={styles.chipText}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Footer input */}
      <View style={styles.inputArea}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Ask Pharmacy Genius..."
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          onSubmitEditing={() => handleSend(inputText)}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={() => handleSend(inputText)}>
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  leftHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  menuBtn: {
    padding: spacing.xs,
  },
  assistantStatus: { flexDirection: 'row', alignItems: 'center' },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
    marginRight: spacing.sm,
  },
  assistantTitle: { ...typography.body, fontWeight: '700', color: colors.textPrimary },
  assistantSubtitle: { ...typography.caption, color: colors.textSecondary },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: { flex: 1 },
  messageContent: { padding: spacing.md, paddingBottom: spacing.lg },
  messageRow: { flexDirection: 'row', marginBottom: spacing.md, alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  assistantRow: { justifyContent: 'flex-start' },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    marginBottom: 4,
  },
  bubble: {
    padding: spacing.md,
    borderRadius: radius.lg,
    maxWidth: '80%',
    ...shadows.small,
  },
  userBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2,
  },
  assistantBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  messageText: {
    ...typography.body,
    color: '#fff',
    lineHeight: 20,
  },
  timeText: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.4)',
    alignSelf: 'flex-end',
    marginTop: 4,
    fontSize: 9,
  },
  carousel: {
    marginTop: spacing.md,
    flexDirection: 'row',
  },
  carouselContent: {
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  productCard: {
    width: 140,
    backgroundColor: colors.surfaceLight,
    borderRadius: radius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  productName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    fontSize: 12,
  },
  productDetail: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 10,
    marginTop: 2,
  },
  productPrice: {
    ...typography.body,
    fontWeight: '700',
    color: colors.primary,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  cardActionBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingVertical: 4,
    marginTop: spacing.sm,
    alignItems: 'center',
  },
  cardActionBtnText: {
    ...typography.caption,
    fontWeight: '700',
    color: '#fff',
    fontSize: 10,
  },
  actionBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  actionBtnText: {
    ...typography.body,
    fontWeight: '600',
    color: '#fff',
  },
  chipsContainer: {
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  chipsScroll: { paddingHorizontal: spacing.md },
  chip: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  chipText: {
    ...typography.body,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    color: '#fff',
    ...typography.body,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
