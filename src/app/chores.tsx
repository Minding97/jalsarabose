import { Check, ChevronLeft, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { EmptyState } from '@/components/app/empty-state';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { SegmentedControl } from '@/components/app/segmented-control';
import { choreRepeatLabels } from '@/domain/labels';
import { Chore, ChoreRepeatCycle, ChoreStatus } from '@/domain/types';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { todayIso } from '@/utils/dates';
import { getChoreSummary, getMemberName } from '@/utils/dashboard';
import { validateChoreInput } from '@/utils/validation';

type ChoreView = 'list' | 'dashboard';

export default function ChoresScreen() {
  const theme = useTheme();
  const snapshot = useHouseholdStore();
  const completeChore = useHouseholdStore((state) => state.completeChore);
  const addChoreItem = useHouseholdStore((state) => state.addChoreItem);
  const updateChoreItem = useHouseholdStore((state) => state.updateChoreItem);
  const deleteChoreItem = useHouseholdStore((state) => state.deleteChoreItem);
  const summary = getChoreSummary(snapshot, todayIso());
  const [view, setView] = useState<ChoreView>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState(snapshot.members[0]?.id ?? '');
  const [dueDate, setDueDate] = useState(todayIso());
  const [repeatCycle, setRepeatCycle] = useState<ChoreRepeatCycle>('weekly');
  const [status, setStatus] = useState<ChoreStatus>('scheduled');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const doneCount = snapshot.chores.filter((chore) => chore.status === 'done').length;
  const completionPercent =
    snapshot.chores.length === 0 ? 0 : Math.round((doneCount / snapshot.chores.length) * 100);
  const maxContribution = Math.max(...summary.contribution.map((item) => item.completedScore), 1);

  const resetForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setTitle('');
    setAssigneeId(snapshot.members[0]?.id ?? '');
    setDueDate(todayIso());
    setRepeatCycle('weekly');
    setStatus('scheduled');
    setFormError(null);
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const editChore = (chore: Chore) => {
    setEditingId(chore.id);
    setTitle(chore.title);
    setAssigneeId(chore.assigneeId);
    setDueDate(chore.dueDate);
    setRepeatCycle(chore.repeatCycle);
    setStatus(chore.status);
    setFormError(null);
    setFormOpen(true);
  };

  const submit = async () => {
    const payload = {
      title: title.trim(),
      assigneeId,
      dueDate,
      repeatCycle,
      score: 1,
      status,
      memo: undefined,
      notificationEnabled: true,
    };
    const validationMessage = validateChoreInput(payload);
    if (validationMessage) {
      setFormError(validationMessage);
      return;
    }

    setSubmitting(true);
    try {
      if (editingId) {
        await updateChoreItem(editingId, payload);
      } else {
        await addChoreItem(payload);
      }
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '집안일을 저장하지 못했어요.');
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
      await deleteChoreItem(editingId);
      resetForm();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '집안일을 삭제하지 못했어요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (formOpen) {
    const nextNames = snapshot.members
      .filter((member) => member.id !== assigneeId)
      .map((member) => getMemberName(snapshot.members, member.id))
      .concat(getMemberName(snapshot.members, assigneeId));

    return (
      <Screen testID="chore-form-screen">
        <View style={styles.formHeader}>
          <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={resetForm}>
            <ChevronLeft size={22} color={theme.textSecondary} strokeWidth={2} />
          </Pressable>
          <Text style={[styles.formTitle, { color: theme.text }]}>
            {editingId ? '집안일 수정' : '집안일 등록'}
          </Text>
        </View>

        <FormField
          label="집안일 이름"
          value={title}
          onChangeText={setTitle}
          placeholder="예: 설거지"
          testID="chore-title-input"
        />
        <FormField
          label="수행 날짜"
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="YYYY-MM-DD"
          testID="chore-due-date-input"
        />
        <ChipGroup
          label="반복 주기"
          value={repeatCycle}
          options={repeatOptions}
          onChange={setRepeatCycle}
        />
        <ChipGroup
          label="이번 차례 담당자"
          value={assigneeId}
          options={snapshot.members.map((member) => ({
            value: member.id,
            label: getMemberName(snapshot.members, member.id),
          }))}
          onChange={setAssigneeId}
        />
        <Text style={[styles.rotationPreview, { color: theme.textSecondary }]}>
          다음 차례부터 {nextNames.join(' → ')} 순서로 이어져요
        </Text>
        <ChipGroup
          label="상태"
          value={status}
          options={[
            { value: 'scheduled', label: '대기' },
            { value: 'done', label: '완료' },
            { value: 'missed', label: '미완료' },
          ]}
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
            testID="chore-submit-button"
            onPress={submit}
            disabled={submitting || !title.trim() || !assigneeId}
            style={styles.saveAction}>
            저장
          </ActionButton>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="집안일"
      testID="chores-screen"
      floatingAction={<FloatingButton onPress={openNewForm} />}>
      <SegmentedControl
        value={view}
        options={[
          { value: 'list', label: '목록' },
          { value: 'dashboard', label: '대시보드' },
        ]}
        onChange={setView}
        accessibilityLabel="집안일 보기"
      />

      {view === 'list' ? (
        snapshot.chores.length === 0 ? (
          <EmptyState title="등록된 집안일이 없어요." description="함께 할 일을 등록해보세요." />
        ) : (
          snapshot.chores.map((chore, index) => {
            const memberName = getMemberName(snapshot.members, chore.assigneeId);
            const done = chore.status === 'done';
            return (
              <Card key={chore.id} style={styles.listCard}>
                <View style={styles.choreRow}>
                  <Pressable
                    testID={`chore-complete-button-${chore.id}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityLabel={`${chore.title} 완료`}
                    disabled={done}
                    onPress={() => void completeChore(chore.id)}
                    style={[
                      styles.checkbox,
                      {
                        borderColor: done ? theme.primary : theme.border,
                        backgroundColor: done ? theme.primary : theme.backgroundElement,
                      },
                    ]}>
                    {done ? <Check size={15} color="#FFFFFF" strokeWidth={3} /> : null}
                  </Pressable>
                  <Pressable style={styles.choreText} onPress={() => editChore(chore)}>
                    <Text
                      style={[
                        styles.choreTitle,
                        { color: done ? theme.textSecondary : theme.text },
                      ]}>
                      {chore.title}
                    </Text>
                    <Text style={[styles.choreMeta, { color: theme.textSecondary }]}>
                      {choreRepeatLabels[chore.repeatCycle]} · {memberName} 담당
                    </Text>
                  </Pressable>
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: index % 2 === 0 ? '#14140F' : '#2B2A28' },
                    ]}>
                    <Text style={styles.avatarText}>{memberName.slice(0, 1)}</Text>
                  </View>
                </View>
              </Card>
            );
          })
        )
      ) : (
        <>
          <Card style={styles.completionCard}>
            <Text style={[styles.dashboardLabel, { color: theme.textSecondary }]}>오늘 수행률</Text>
            <Text style={[styles.completionValue, { color: theme.text }]}>
              {completionPercent}%
            </Text>
            <ProgressBar percent={completionPercent} color={theme.primary} />
          </Card>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>이번 주 수행 현황</Text>
          <View style={styles.memberBars}>
            {summary.contribution.map((member, index) => (
              <View key={member.memberId} style={styles.memberBar}>
                <View style={styles.progressHeader}>
                  <Text style={[styles.progressLabel, { color: theme.text }]}>{member.name}</Text>
                  <Text style={[styles.progressValue, { color: theme.textSecondary }]}>
                    {member.completedScore}건
                  </Text>
                </View>
                <ProgressBar
                  percent={(member.completedScore / maxContribution) * 100}
                  color={index % 2 === 0 ? theme.primary : '#2B2A28'}
                />
              </View>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: theme.text }]}>로테이션 순서</Text>
          {snapshot.chores.map((chore) => (
            <Card key={chore.id} style={styles.rotationCard}>
              <View style={styles.rotationRow}>
                <Text style={[styles.rotationTitle, { color: theme.text }]}>{chore.title}</Text>
                <Text style={[styles.rotationOrder, { color: theme.textSecondary }]}>
                  {getMemberName(snapshot.members, chore.assigneeId)} → 다음 가구원
                </Text>
              </View>
            </Card>
          ))}
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

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.progressTrack, { backgroundColor: theme.chip }]}>
      <View
        style={[
          styles.progressFill,
          { backgroundColor: color, width: `${Math.max(Math.min(percent, 100), 3)}%` },
        ]}
      />
    </View>
  );
}

function FloatingButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      testID="chore-add-button"
      accessibilityRole="button"
      accessibilityLabel="집안일 등록"
      onPress={onPress}
      style={[styles.fab, { backgroundColor: theme.primary }]}>
      <Plus size={27} color="#FFFFFF" strokeWidth={2} />
    </Pressable>
  );
}

const repeatOptions = Object.entries(choreRepeatLabels).map(([value, label]) => ({
  value: value as ChoreRepeatCycle,
  label,
}));

const styles = StyleSheet.create({
  listCard: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  choreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choreText: {
    flex: 1,
  },
  choreTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  choreMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  completionCard: {
    padding: 18,
  },
  dashboardLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  completionValue: {
    fontSize: 26,
    lineHeight: 34,
    fontWeight: '800',
  },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  memberBars: {
    gap: 12,
    marginBottom: 4,
  },
  memberBar: {
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
  rotationCard: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rotationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  rotationTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  rotationOrder: {
    fontSize: 12,
    fontWeight: '500',
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
  rotationPreview: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: -4,
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
