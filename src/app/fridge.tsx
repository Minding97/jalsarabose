import { Check, ChevronLeft, Plus, Trash2 } from 'lucide-react-native';
import { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { EmptyState } from '@/components/app/empty-state';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { SegmentedControl } from '@/components/app/segmented-control';
import { fridgeCategoryLabels, fridgeStatusLabels, storageTypeLabels } from '@/domain/labels';
import { FridgeCategory, FridgeItem, FridgeStatus, StorageType } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { daysUntil, todayIso } from '@/utils/dates';
import { getFridgeSummary } from '@/utils/dashboard';
import { validateFridgeItemInput } from '@/utils/validation';

type FridgeView = 'list' | 'dashboard';

export default function FridgeScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const addFridgeItemEntry = useHouseholdStore((state) => state.addFridgeItemEntry);
  const updateFridgeItemEntry = useHouseholdStore((state) => state.updateFridgeItemEntry);
  const deleteFridgeItemEntry = useHouseholdStore((state) => state.deleteFridgeItemEntry);
  const updateFridgeItemStatus = useHouseholdStore((state) => state.updateFridgeItemStatus);
  const today = todayIso();
  const summary = getFridgeSummary(snapshot, today);
  const [view, setView] = useState<FridgeView>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [category, setCategory] = useState<FridgeCategory>('other');
  const [storageType, setStorageType] = useState<StorageType>('fridge');
  const [status, setStatus] = useState<FridgeStatus>('stocked');
  const [memo, setMemo] = useState('');
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const stockedItems = snapshot.fridgeItems.filter((item) => item.status === 'stocked');
  const groups = groupFridgeItems(stockedItems, today);
  const categoryCounts = Object.values(
    stockedItems.reduce<Record<string, { category: FridgeCategory; count: number }>>(
      (acc, item) => {
        const category = fridgeCategoryLabels[item.category] ? item.category : 'other';
        acc[category] ??= { category, count: 0 };
        acc[category].count += 1;
        return acc;
      },
      {},
    ),
  ).sort((a, b) => b.count - a.count);
  const maxCategoryCount = Math.max(...categoryCounts.map((item) => item.count), 1);

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setName('');
    setQuantity('');
    setExpiryDate('');
    setCategory('other');
    setStorageType('fridge');
    setStatus('stocked');
    setMemo('');
    setNotificationEnabled(true);
    setFormError(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const editItem = (item: FridgeItem) => {
    setEditingId(item.id);
    setName(item.name);
    setQuantity(item.quantity ?? '');
    setExpiryDate(item.expiryDate ?? '');
    setCategory(item.category);
    setStorageType(item.storageType);
    setStatus(item.status);
    setMemo(item.memo ?? '');
    setNotificationEnabled(item.notificationEnabled);
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async () => {
    const payload = {
      name: name.trim(),
      quantity: quantity.trim() || undefined,
      expiryDate: expiryDate.trim() || undefined,
      category,
      storageType,
      status,
      memo: memo.trim() || undefined,
      notificationEnabled,
    };
    const validationMessage = validateFridgeItemInput(payload);
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateFridgeItemEntry(editingId, payload);
      } else {
        await addFridgeItemEntry(payload);
      }
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '냉장고 항목을 저장하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (item: FridgeItem, nextStatus: FridgeStatus) => {
    setActionItemId(item.id);
    setActionError(null);
    try {
      await updateFridgeItemStatus(item.id, nextStatus);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '냉장고 상태를 변경하지 못했어요.');
    } finally {
      setActionItemId(null);
    }
  };

  const remove = async () => {
    if (!editingId) {
      return;
    }
    setSubmitting(true);
    try {
      await deleteFridgeItemEntry(editingId);
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '냉장고 항목을 삭제하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (formOpen) {
    return (
      <Screen testID="fridge-form-screen">
        <View style={styles.formHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={resetForm}>
            <ChevronLeft size={22} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.formTitle, { color: theme.text }]}>
            {editingId ? '냉장고 항목 수정' : '냉장고 항목 등록'}
          </Text>
        </View>

        <FormField
          label="품목명"
          value={name}
          onChangeText={setName}
          placeholder="예: 우유"
          testID="fridge-name-input"
        />
        <View style={styles.fieldRow}>
          <View style={styles.fieldHalf}>
            <FormField
              label="수량"
              value={quantity}
              onChangeText={setQuantity}
              placeholder="예: 1개"
              testID="fridge-quantity-input"
            />
          </View>
          <View style={styles.fieldHalf}>
            <FormField
              label="유통/소비기한"
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="YYYY-MM-DD"
              testID="fridge-expiry-date-input"
            />
          </View>
        </View>
        <ChipGroup
          label="분류"
          value={category}
          options={categoryOptions}
          onChange={setCategory}
          testIDPrefix="fridge-category"
        />
        <ChipGroup
          label="보관 위치"
          value={storageType}
          options={storageOptions}
          onChange={setStorageType}
          testIDPrefix="fridge-storage"
        />
        <ChipGroup
          label="상태"
          value={status}
          options={statusOptions}
          onChange={setStatus}
          testIDPrefix="fridge-status"
        />
        <FormField
          label="메모"
          value={memo}
          onChangeText={setMemo}
          placeholder="예: 개봉함, 먼저 먹기"
          testID="fridge-memo-input"
        />
        <SettingToggle
          label="유통기한 알림"
          description="기한이 가까워지면 홈과 알림에서 알려줘요"
          value={notificationEnabled}
          onValueChange={setNotificationEnabled}
        />
        {formError ? <Text style={[styles.errorText, { color: theme.danger }]}>{formError}</Text> : null}
        <View style={styles.formActions}>
          {editingId ? (
            <ActionButton
              testID="fridge-delete-button"
              variant="secondary"
              onPress={remove}
              disabled={submitting}
              style={styles.deleteAction}>
              삭제
            </ActionButton>
          ) : null}
          <ActionButton
            testID="fridge-submit-button"
            onPress={submit}
            disabled={submitting || !name.trim()}
            style={styles.saveAction}>
            저장
          </ActionButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="냉장고"
      testID="fridge-screen"
      floatingAction={<FloatingButton onPress={openNewForm} />}>
      <SegmentedControl
        value={view}
        options={[
          { value: 'list', label: '목록' },
          { value: 'dashboard', label: '대시보드' },
        ]}
        onChange={setView}
        accessibilityLabel="냉장고 보기"
      />

      {view === 'list' ? (
        stockedItems.length === 0 ? (
          <EmptyState title="보관 중인 항목이 없어요." description="냉장고 항목을 등록해보세요." />
        ) : (
          groups.map((group) =>
            group.items.length > 0 ? (
              <View key={group.key} style={styles.group}>
                <Text style={[styles.groupLabel, { color: group.color(theme) }]}>{group.label}</Text>
                {group.items.map((item) => {
                  const dday = getDday(item, today);
                  return (
                    <Card key={item.id} style={styles.listCard}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${item.name} 냉장고 항목 수정`}
                        testID={`fridge-item-${item.id}`}
                        onPress={() => editItem(item)}>
                        <View style={styles.itemRow}>
                          <View style={styles.itemText}>
                            <Text style={[styles.itemName, { color: theme.text }]}>{item.name}</Text>
                            <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
                              {item.quantity ?? '수량 미입력'} · {storageTypeLabels[item.storageType]}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.ddayBadge,
                              {
                                backgroundColor:
                                  dday.days !== null && dday.days <= 3
                                    ? theme.primarySoft
                                    : theme.chip,
                              },
                            ]}>
                            <Text
                              style={[
                                styles.ddayText,
                                {
                                  color:
                                    dday.days !== null && dday.days <= 3
                                      ? theme.primary
                                      : theme.textSecondary,
                                },
                              ]}>
                              {dday.label}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                      <View style={[styles.quickActions, { borderTopColor: theme.border }]}>
                        <QuickAction
                          label="소진"
                          accessibilityLabel={`${item.name} 소진`}
                          testID={`fridge-use-button-${item.id}`}
                          icon={<Check size={15} color={theme.primary} strokeWidth={2.5} />}
                          color={theme.primary}
                          disabled={actionItemId === item.id}
                          onPress={() => void changeStatus(item, 'used')}
                        />
                        <QuickAction
                          label="폐기"
                          accessibilityLabel={`${item.name} 폐기`}
                          testID={`fridge-discard-button-${item.id}`}
                          icon={<Trash2 size={15} color={theme.danger} strokeWidth={2.2} />}
                          color={theme.danger}
                          disabled={actionItemId === item.id}
                          onPress={() => void changeStatus(item, 'discarded')}
                        />
                      </View>
                    </Card>
                  );
                })}
              </View>
            ) : null,
          )
        )
      ) : (
        <>
          <View style={styles.summaryGrid}>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>전체 재고</Text>
              <Text style={[styles.summaryValue, { color: theme.text }]}>{summary.stockCount}개</Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>
                유통기한 임박
              </Text>
              <Text style={[styles.summaryValue, { color: theme.primary }]}>
                {summary.expiringCount}개
              </Text>
            </Card>
            <Card style={styles.summaryCard}>
              <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>기한 초과</Text>
              <Text style={[styles.summaryValue, { color: theme.danger }]}>
                {summary.expiredCount}개
              </Text>
            </Card>
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>분류별 재고</Text>
          {categoryCounts.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>보관 중인 재고가 없어요</Text>
          ) : (
            <View style={styles.categoryBars} testID="fridge-category-summary">
              {categoryCounts.map((item) => (
              <View key={item.category} style={styles.progressRow}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressLabel, { color: theme.text }]}>
                    {fridgeCategoryLabels[item.category]}
                  </Text>
                  <Text style={[styles.progressValue, { color: theme.textSecondary }]}>
                    {item.count}개
                  </Text>
                </View>
                <View style={[styles.progressTrack, { backgroundColor: theme.chip }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        backgroundColor: theme.primary,
                        width: `${Math.max((item.count / maxCategoryCount) * 100, 4)}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              ))}
            </View>
          )}

          <Text style={[styles.sectionTitle, { color: theme.text }]}>보관 위치별 재고</Text>
          <View style={styles.storageSummary} testID="fridge-storage-summary">
            {summary.byStorage.map((item) => (
              <View key={item.storageType} style={[styles.storageItem, { borderColor: theme.border }]}>
                <Text style={[styles.storageLabel, { color: theme.textSecondary }]}>
                  {storageTypeLabels[item.storageType]}
                </Text>
                <Text style={[styles.storageValue, { color: theme.text }]}>{item.count}개</Text>
                <Text style={[styles.storageHelper, { color: theme.textTertiary }]}>
                  임박 {item.expiringCount}개
                </Text>
              </View>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>최근 등록</Text>
          <ItemSummaryList
            items={summary.recentItems.slice(0, 5)}
            emptyText="최근 3일 안에 등록한 항목이 없어요"
            onPress={editItem}
          />

          <Text style={[styles.sectionTitle, { color: theme.text }]}>소진·폐기 이력</Text>
          <View testID="fridge-processed-summary">
            <ItemSummaryList
              items={summary.processedItems.slice(0, 5)}
              emptyText="소진하거나 폐기한 항목이 없어요"
              onPress={editItem}
            />
          </View>
        </>
      )}
      {actionError ? <Text style={[styles.errorText, { color: theme.danger }]}>{actionError}</Text> : null}
    </Screen>
  );
}

function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  testIDPrefix,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  testIDPrefix?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.chipSection}>
      <Text style={[styles.fieldLabel, { color: theme.textSecondary }]}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityLabel={`${label} ${option.label}`}
              accessibilityState={{ selected }}
              testID={testIDPrefix ? `${testIDPrefix}-${option.value}` : undefined}
              onPress={() => onChange(option.value)}
              style={[
                styles.chip,
                { backgroundColor: selected ? theme.primarySoft : theme.chip },
              ]}>
              <Text
                style={[
                  styles.chipText,
                  { color: selected ? theme.primary : theme.textSecondary },
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SettingToggle({
  label,
  description,
  value,
  onValueChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.toggleRow, { borderColor: theme.border }]}>
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.toggleDescription, { color: theme.textSecondary }]}>
          {description}
        </Text>
      </View>
      <Switch
        testID="fridge-notification-switch"
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: theme.chip, true: theme.primarySoft }}
        thumbColor={value ? theme.primary : theme.textTertiary}
      />
    </View>
  );
}

function QuickAction({
  label,
  accessibilityLabel,
  testID,
  icon,
  color,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  testID: string;
  icon: ReactNode;
  color: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={styles.quickAction}>
      {icon}
      <Text style={[styles.quickActionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

function ItemSummaryList({
  items,
  emptyText,
  onPress,
}: {
  items: FridgeItem[];
  emptyText: string;
  onPress: (item: FridgeItem) => void;
}) {
  const theme = useTheme();
  if (items.length === 0) {
    return <Text style={[styles.emptyText, { color: theme.textSecondary }]}>{emptyText}</Text>;
  }

  return (
    <View style={styles.summaryList}>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="button"
          accessibilityLabel={`${item.name} 냉장고 항목 수정`}
          onPress={() => onPress(item)}
          style={[styles.summaryListRow, { borderBottomColor: theme.border }]}>
          <View style={styles.summaryListText}>
            <Text style={[styles.summaryListName, { color: theme.text }]}>{item.name}</Text>
            <Text style={[styles.itemMeta, { color: theme.textSecondary }]}>
              {item.quantity ?? '수량 미입력'} · {storageTypeLabels[item.storageType]}
            </Text>
          </View>
          <Text
            style={[
              styles.summaryListStatus,
              {
                color:
                  item.status === 'discarded'
                    ? theme.danger
                    : item.status === 'used'
                      ? theme.info
                      : theme.primary,
              },
            ]}>
            {fridgeStatusLabels[item.status]}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function FloatingButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID="fridge-add-button"
      accessibilityRole="button"
      accessibilityLabel="냉장고 항목 등록"
      onPress={onPress}
      style={[styles.fab, { backgroundColor: theme.primary }]}>
      <Plus size={27} color="#FFFFFF" strokeWidth={2} />
    </Pressable>
  );
}

function groupFridgeItems(items: FridgeItem[], today: string) {
  return [
    {
      key: 'expired',
      label: '유통기한 지남',
      color: (theme: ReturnType<typeof useTheme>) => theme.danger,
      items: items.filter((item) => item.expiryDate && daysUntil(item.expiryDate, today) < 0),
    },
    {
      key: 'soon',
      label: '유통기한 임박',
      color: (theme: ReturnType<typeof useTheme>) => theme.primary,
      items: items.filter((item) => {
        if (!item.expiryDate) return false;
        const days = daysUntil(item.expiryDate, today);
        return days >= 0 && days <= 3;
      }),
    },
    {
      key: 'fresh',
      label: '신선 보관 중',
      color: (theme: ReturnType<typeof useTheme>) => theme.textSecondary,
      items: items.filter(
        (item) => !item.expiryDate || daysUntil(item.expiryDate, today) > 3,
      ),
    },
  ];
}

function getDday(item: FridgeItem, today: string) {
  if (!item.expiryDate) {
    return { days: null, label: '기한 없음' };
  }
  const days = daysUntil(item.expiryDate, today);
  if (days < 0) return { days, label: `D+${Math.abs(days)}` };
  if (days === 0) return { days, label: 'D-day' };
  return { days, label: `D-${days}` };
}

const categoryOptions = Object.entries(fridgeCategoryLabels).map(([value, label]) => ({
  value: value as FridgeCategory,
  label,
}));

const storageOptions = Object.entries(storageTypeLabels).map(([value, label]) => ({
  value: value as StorageType,
  label,
}));

const statusOptions = Object.entries(fridgeStatusLabels).map(([value, label]) => ({
  value: value as FridgeStatus,
  label,
}));

const styles = StyleSheet.create({
  group: {
    gap: 8,
    marginBottom: 4,
  },
  groupLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  listCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemText: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  quickActions: {
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    paddingTop: 9,
  },
  quickAction: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  quickActionText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  ddayBadge: {
    minHeight: 26,
    borderRadius: 100,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ddayText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 16,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  categoryBars: {
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '500',
    paddingVertical: 6,
  },
  storageSummary: {
    flexDirection: 'row',
    gap: 8,
  },
  storageItem: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 2,
  },
  storageLabel: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  storageValue: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '800',
  },
  storageHelper: {
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '500',
  },
  summaryList: {
    gap: 0,
  },
  summaryListRow: {
    minHeight: 54,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  summaryListText: {
    flex: 1,
    minWidth: 0,
  },
  summaryListName: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '600',
  },
  summaryListStatus: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  progressRow: {
    gap: 4,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 8px 20px rgba(23, 184, 84, 0.28)',
    elevation: 8,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 2,
  },
  formTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '800',
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
    minWidth: 0,
  },
  toggleRow: {
    minHeight: 64,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
  },
  toggleText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toggleLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  toggleDescription: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  chipSection: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 36,
    borderRadius: 100,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  deleteAction: {
    flex: 1,
  },
  saveAction: {
    flex: 2,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
});
