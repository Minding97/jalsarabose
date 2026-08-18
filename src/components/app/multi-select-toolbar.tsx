import { Check, X } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { useTheme } from '@/hooks/use-theme';

type MultiSelectToolbarProps = {
  count: number;
  onCancel: () => void;
  onDelete: () => void;
  onEdit: () => void;
  busy?: boolean;
  testIDPrefix: string;
};

export function MultiSelectToolbar({
  count,
  onCancel,
  onDelete,
  onEdit,
  busy,
  testIDPrefix,
}: MultiSelectToolbarProps) {
  const theme = useTheme();

  return (
    <Card style={[styles.toolbar, { borderColor: theme.primary }]}>
      <View style={styles.heading}>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.count, { color: theme.text }]}>
          {count}개 선택됨
        </Text>
        <Pressable
          testID={`${testIDPrefix}-selection-cancel`}
          accessibilityRole="button"
          accessibilityLabel="다중 선택 취소"
          onPress={onCancel}
          style={styles.cancelButton}>
          <X size={18} color={theme.textSecondary} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        <ActionButton
          testID={`${testIDPrefix}-bulk-delete-button`}
          variant="danger"
          onPress={onDelete}
          disabled={busy}
          style={styles.action}>
          삭제
        </ActionButton>
        <ActionButton
          testID={`${testIDPrefix}-bulk-edit-button`}
          onPress={onEdit}
          disabled={busy}
          style={styles.action}>
          일괄 수정
        </ActionButton>
      </View>
    </Card>
  );
}

export function SelectionIndicator({ selected }: { selected: boolean }) {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.indicator,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}>
      {selected ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    borderRadius: 16,
    padding: 12,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  count: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  cancelButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    flex: 1,
  },
  indicator: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
