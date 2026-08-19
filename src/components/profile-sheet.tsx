import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { FormField } from '@/components/app/form-field';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { formatKoreanDate } from '@/utils/dates';
import { getMemberDisplayName } from '@/utils/dashboard';
import { getMyMemos } from '@/utils/my-page';

type ProfileSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileSheet({ visible, onClose }: ProfileSheetProps) {
  const theme = useTheme();
  const members = useHouseholdStore((state) => state.members);
  const household = useHouseholdStore((state) => state.household);
  const currentUser = useHouseholdStore((state) => state.currentUser);
  const expenses = useHouseholdStore((state) => state.expenses);
  const fridgeItems = useHouseholdStore((state) => state.fridgeItems);
  const joinHousehold = useHouseholdStore((state) => state.joinHousehold);
  const signOut = useHouseholdStore((state) => state.signOut);
  const scheduleNotifications = useHouseholdStore((state) => state.scheduleNotifications);
  const cancelNotifications = useHouseholdStore((state) => state.cancelNotifications);
  const notificationMessage = useHouseholdStore((state) => state.notificationMessage);
  const [expiryEnabled, setExpiryEnabled] = useState(true);
  const [switchingHousehold, setSwitchingHousehold] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [submittingSwitch, setSubmittingSwitch] = useState(false);
  const myMemos = getMyMemos({ members, expenses, fridgeItems }, currentUser);
  const accountName =
    currentUser?.displayName ||
    members.find((member) => member.userId === currentUser?.uid)?.name ||
    '사용자';

  const updateExpiryReminder = (enabled: boolean) => {
    setExpiryEnabled(enabled);

    if (enabled) {
      void scheduleNotifications();
    } else {
      void cancelNotifications();
    }
  };

  const switchHousehold = async () => {
    const normalizedCode = inviteCode.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,8}$/.test(normalizedCode)) {
      setSwitchError('초대 코드는 6~8자리 대문자와 숫자로 입력해주세요.');
      return;
    }

    setSubmittingSwitch(true);
    setSwitchError(null);
    try {
      await joinHousehold(normalizedCode);
      setInviteCode('');
      setSwitchingHousehold(false);
      onClose();
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : '가구를 변경하지 못했어요.');
    } finally {
      setSubmittingSwitch(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable
          testID="profile-backdrop"
          accessibilityRole="button"
          accessibilityLabel="마이페이지 닫기"
          style={styles.backdrop}
          onPress={onClose}
        />
        <View style={[styles.sheet, { backgroundColor: theme.background }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>마이페이지</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              testID="profile-close-button"
              onPress={onClose}
              style={styles.closeButton}>
              <X size={20} color={theme.textSecondary} strokeWidth={2} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>계정</Text>
            <View
              testID="profile-account-section"
              style={[
                styles.accountCard,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={styles.accountRow}>
                <View style={[styles.accountAvatar, { backgroundColor: '#2B2A28' }]}>
                  <Text style={styles.accountInitial}>{accountName.slice(0, 1)}</Text>
                </View>
                <View style={styles.accountTextGroup}>
                  <Text style={[styles.accountName, { color: theme.text }]} numberOfLines={1}>
                    {accountName}
                  </Text>
                  <Text
                    style={[styles.accountEmail, { color: theme.textSecondary }]}
                    numberOfLines={1}>
                    {currentUser?.email || '이메일 정보 없음'}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>내가 남긴 메모</Text>
            <View testID="profile-memo-section" style={styles.memoSection}>
              {myMemos.length === 0 ? (
                <View
                  style={[
                    styles.memoEmpty,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <Text style={[styles.memoEmptyTitle, { color: theme.text }]}>남긴 메모가 없어요</Text>
                  <Text style={[styles.memoEmptyDescription, { color: theme.textSecondary }]}>
                    지출이나 냉장고 항목에 작성한 메모가 여기에 모여요.
                  </Text>
                </View>
              ) : (
                myMemos.map((memo) => (
                  <View
                    key={`${memo.kind}-${memo.id}`}
                    testID={`profile-memo-${memo.kind}-${memo.id}`}
                    style={[
                      styles.memoCard,
                      { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    ]}>
                    <View style={styles.memoHeading}>
                      <Text style={[styles.memoKind, { color: theme.primary }]}>
                        {memo.kindLabel}
                      </Text>
                      <Text style={[styles.memoDate, { color: theme.textTertiary }]}>
                        {formatKoreanDate(memo.createdAt, 'M월 d일')}
                      </Text>
                    </View>
                    <Text style={[styles.memoTitle, { color: theme.text }]} numberOfLines={1}>
                      {memo.title}
                    </Text>
                    <Text style={[styles.memoBody, { color: theme.textSecondary }]}>
                      {memo.memo}
                    </Text>
                  </View>
                ))
              )}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>우리 집</Text>
            <View
              style={[
                styles.panel,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              {members.map((member, index) => {
                const memberName = getMemberDisplayName(member, index);
                return (
                  <View key={member.id} style={styles.memberRow}>
                    <View style={[styles.memberAvatar, { backgroundColor: '#2B2A28' }]}>
                      <Text style={styles.memberInitial}>{memberName.slice(0, 1)}</Text>
                    </View>
                    <Text style={[styles.memberName, { color: theme.text }]}>{memberName}</Text>
                    <Text style={[styles.memberRole, { color: theme.textSecondary }]}>
                      {member.role === 'admin' ? '관리자' : '가구원'}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>알림 설정</Text>
            <View
              style={[
                styles.panel,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={[styles.settingRow, styles.settingRowLast]}>
                <Text style={[styles.settingText, { color: theme.text }]}>유통기한 알림</Text>
                <Switch
                  value={expiryEnabled}
                  onValueChange={updateExpiryReminder}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
            {notificationMessage ? (
              <Text style={[styles.helperText, { color: theme.textSecondary }]}>
                {notificationMessage}
              </Text>
            ) : null}

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>가구원 관리</Text>
            <View
              style={[
                styles.inviteCard,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <Text style={[styles.inviteText, { color: theme.textSecondary }]}>
                초대 코드{' '}
                <Text style={[styles.inviteCode, { color: theme.primary }]}>
                  {household.inviteCode || '없음'}
                </Text>
                을 공유해서 가구원을 추가해요
              </Text>
            </View>

            {switchingHousehold ? (
              <View style={styles.switchForm}>
                <FormField
                  label="다른 가구 초대 코드"
                  value={inviteCode}
                  onChangeText={(value) => {
                    setInviteCode(value.toUpperCase());
                    setSwitchError(null);
                  }}
                  placeholder="예: JALSAL"
                  autoCapitalize="characters"
                  testID="profile-household-code-input"
                />
                {switchError ? (
                  <Text style={[styles.switchError, { color: theme.danger }]}>{switchError}</Text>
                ) : null}
                <View style={styles.switchActions}>
                  <ActionButton
                    variant="secondary"
                    onPress={() => {
                      setSwitchingHousehold(false);
                      setInviteCode('');
                      setSwitchError(null);
                    }}
                    style={styles.switchAction}>
                    취소
                  </ActionButton>
                  <ActionButton
                    testID="profile-household-join-button"
                    onPress={() => void switchHousehold()}
                    disabled={submittingSwitch || !inviteCode.trim()}
                    style={styles.switchAction}>
                    {submittingSwitch ? '이동 중' : '가구 이동'}
                  </ActionButton>
                </View>
              </View>
            ) : (
              <ActionButton
                testID="profile-household-switch-button"
                variant="secondary"
                onPress={() => setSwitchingHousehold(true)}>
                다른 가구로 이동
              </ActionButton>
            )}

            <Pressable
              testID="profile-sign-out-button"
              accessibilityRole="button"
              onPress={signOut}
              style={styles.signOutButton}>
              <Text style={[styles.signOutText, { color: theme.textTertiary }]}>로그아웃</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  backdrop: {
    flex: 1,
    width: '100%',
  },
  sheet: {
    width: '100%',
    maxWidth: MaxContentWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    maxHeight: '84%',
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  scroll: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 4,
  },
  sheetTitle: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: '800',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  accountCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accountAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInitial: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  accountTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  accountName: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '700',
  },
  accountEmail: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  memoSection: {
    gap: 8,
    marginBottom: 20,
  },
  memoCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 5,
  },
  memoHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  memoKind: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  memoDate: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
  },
  memoTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  memoBody: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  memoEmpty: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 4,
  },
  memoEmptyTitle: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  memoEmptyDescription: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    textAlign: 'center',
  },
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 20,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInitial: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  memberName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    fontWeight: '500',
  },
  memberRole: {
    flexShrink: 0,
    fontSize: 12,
    fontWeight: '500',
  },
  settingRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  settingText: {
    fontSize: 14,
    fontWeight: '500',
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  helperText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: -12,
    marginBottom: 18,
  },
  inviteCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  inviteText: {
    fontSize: 13,
    lineHeight: 20,
  },
  inviteCode: {
    fontWeight: '700',
  },
  switchForm: {
    gap: 10,
  },
  switchError: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },
  switchActions: {
    flexDirection: 'row',
    gap: 8,
  },
  switchAction: {
    flex: 1,
  },
  signOutButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
