import { ChevronLeft, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { DatePickerField } from '@/components/app/date-picker-field';
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
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stockedItems = snapshot.fridgeItems.filter((item) => item.status === 'stocked');
  const groups = useMemo(() => groupFridgeItems(stockedItems, today), [stockedItems, today]);
  const categoryCounts = useMemo(() => {
    return Object.values(
      stockedItems.reduce<
        Record<string, { category: FridgeCategory; count: number }>
      >((acc, item) => {
        acc[item.category] ??= { category: item.category, count: 0 };
        acc[item.category].count += 1;
        return acc;
      }, {}),
    ).sort((a, b) => b.count - a.count);
  }, [stockedItems]);
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
      memo: undefined,
      notificationEnabled: true,
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
        <FormField
          label="수량"
          value={quantity}
          onChangeText={setQuantity}
          placeholder="예: 1개"
          testID="fridge-quantity-input"
        />
        <DatePickerField
          label="유통기한"
          value={expiryDate}
          onChange={setExpiryDate}
          allowClear
          testID="fridge-expiry-date-input"
        />
        <ChipGroup
          label="분류"
          value={category}
          options={categoryOptions}
          onChange={setCategory}
        />
        <ChipGroup
          label="보관 위치"
          value={storageType}
          options={storageOptions}
          onChange={setStorageType}
        />
        <ChipGroup
          label="상태"
          value={status}
          options={statusOptions}
          onChange={setStatus}
        />
        {formError ? <Text style={[styles.errorText, { color: theme.danger }]}>{formError}</Text> : null}
        <View style={styles.formActions}>
          {editingId ? (
            <ActionButton
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
                    <Pressable key={item.id} onPress={() => editItem(item)}>
                      <Card style={styles.listCard}>
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
                      </Card>
                    </Pressable>
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
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>분류별 재고</Text>
          <View style={styles.categoryBars}>
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
        </>
      )}
    </Screen>
  );
}

function ChipGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
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
              accessibilityState={{ selected }}
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
