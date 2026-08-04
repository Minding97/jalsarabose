import { Pencil, ShieldCheck, ShieldMinus, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { FormField } from '@/components/app/form-field';
import { MaxContentWidth } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';
import { getMemberDisplayName } from '@/utils/dashboard';

type ProfileSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function ProfileSheet({ visible, onClose }: ProfileSheetProps) {
  const theme = useTheme();
  const members = useHouseholdStore((state) => state.members);
  const household = useHouseholdStore((state) => state.household);
  const currentUser = useHouseholdStore((state) => state.currentUser);
  const joinHousehold = useHouseholdStore((state) => state.joinHousehold);
  const renameHousehold = useHouseholdStore((state) => state.renameHousehold);
  const changeMemberRole = useHouseholdStore((state) => state.changeMemberRole);
  const signOut = useHouseholdStore((state) => state.signOut);
  const scheduleNotifications = useHouseholdStore((state) => state.scheduleNotifications);
  const cancelNotifications = useHouseholdStore((state) => state.cancelNotifications);
  const notificationMessage = useHouseholdStore((state) => state.notificationMessage);
  const [expiryEnabled, setExpiryEnabled] = useState(true);
  const [choreEnabled, setChoreEnabled] = useState(false);
  const [switchingHousehold, setSwitchingHousehold] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [submittingSwitch, setSubmittingSwitch] = useState(false);
  const [editingHouseholdName, setEditingHouseholdName] = useState(false);
  const [householdName, setHouseholdName] = useState(household.name);
  const [householdError, setHouseholdError] = useState<string | null>(null);
  const [householdMessage, setHouseholdMessage] = useState<string | null>(null);
  const [submittingHousehold, setSubmittingHousehold] = useState(false);
  const [roleMemberId, setRoleMemberId] = useState<string | null>(null);
  const currentMember = members.find(
    (member) => member.id === currentUser?.uid || member.userId === currentUser?.uid,
  );
  const isAdmin = currentMember?.role === 'admin';

  const updateReminder = (kind: 'expiry' | 'chore', enabled: boolean) => {
    const nextExpiry = kind === 'expiry' ? enabled : expiryEnabled;
    const nextChore = kind === 'chore' ? enabled : choreEnabled;

    if (kind === 'expiry') {
      setExpiryEnabled(enabled);
    } else {
      setChoreEnabled(enabled);
    }

    if (nextExpiry || nextChore) {
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
    if (normalizedCode === household.inviteCode) {
      setSwitchError('현재 참여 중인 가구의 초대 코드예요.');
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

  const saveHouseholdName = async () => {
    const normalizedName = householdName.trim();
    if (normalizedName.length < 2 || normalizedName.length > 30) {
      setHouseholdError('가구 이름은 2~30자로 입력해주세요.');
      return;
    }

    setSubmittingHousehold(true);
    setHouseholdError(null);
    setHouseholdMessage(null);
    try {
      await renameHousehold(normalizedName);
      setEditingHouseholdName(false);
      setHouseholdMessage('가구 이름을 변경했어요.');
    } catch (error) {
      setHouseholdError(error instanceof Error ? error.message : '가구 이름을 변경하지 못했어요.');
    } finally {
      setSubmittingHousehold(false);
    }
  };

  const toggleMemberRole = async (memberId: string, role: 'admin' | 'member') => {
    setRoleMemberId(memberId);
    setHouseholdError(null);
    setHouseholdMessage(null);
    try {
      await changeMemberRole(memberId, role === 'admin' ? 'member' : 'admin');
      setHouseholdMessage(role === 'admin' ? '일반 가구원으로 변경했어요.' : '관리자로 지정했어요.');
    } catch (error) {
      setHouseholdError(error instanceof Error ? error.message : '멤버 역할을 변경하지 못했어요.');
    } finally {
      setRoleMemberId(null);
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
            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>우리 집</Text>
            <View
              style={[
                styles.panel,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={[styles.householdHeader, { borderBottomColor: theme.border }]}>
                <View style={styles.householdHeaderText}>
                  <Text
                    testID="profile-household-name"
                    style={[styles.householdName, { color: theme.text }]}>
                    {household.name}
                  </Text>
                  <Text style={[styles.householdCount, { color: theme.textSecondary }]}>
                    가구원 {members.length}명
                  </Text>
                </View>
                {isAdmin ? (
                  <Pressable
                    testID="profile-household-name-edit-button"
                    accessibilityRole="button"
                    accessibilityLabel="가구 이름 수정"
                    onPress={() => {
                      setHouseholdName(household.name);
                      setEditingHouseholdName(true);
                      setHouseholdError(null);
                      setHouseholdMessage(null);
                    }}
                    style={styles.iconButton}>
                    <Pencil size={17} color={theme.textSecondary} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>
              {editingHouseholdName ? (
                <View style={[styles.householdNameForm, { borderBottomColor: theme.border }]}>
                  <FormField
                    label="가구 이름"
                    value={householdName}
                    onChangeText={(value) => {
                      setHouseholdName(value);
                      setHouseholdError(null);
                    }}
                    placeholder="예: 우리집"
                    testID="profile-household-name-input"
                  />
                  <View style={styles.switchActions}>
                    <ActionButton
                      variant="secondary"
                      onPress={() => {
                        setEditingHouseholdName(false);
                        setHouseholdName(household.name);
                        setHouseholdError(null);
                      }}
                      disabled={submittingHousehold}
                      style={styles.switchAction}>
                      취소
                    </ActionButton>
                    <ActionButton
                      testID="profile-household-name-save-button"
                      onPress={() => void saveHouseholdName()}
                      disabled={submittingHousehold || householdName.trim() === household.name}
                      style={styles.switchAction}>
                      저장
                    </ActionButton>
                  </View>
                </View>
              ) : null}
              {members.map((member, index) => {
                const memberName = getMemberDisplayName(member, index);
                const isCurrentMember =
                  member.id === currentUser?.uid || member.userId === currentUser?.uid;
                return (
                  <View key={member.id} style={styles.memberRow}>
                    <View style={[styles.memberAvatar, { backgroundColor: '#2B2A28' }]}>
                      <Text style={styles.memberInitial}>{memberName.slice(0, 1)}</Text>
                    </View>
                    <Text style={[styles.memberName, { color: theme.text }]}>{memberName}</Text>
                    {isAdmin && !isCurrentMember ? (
                      <Pressable
                        testID={`profile-member-role-button-${member.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${memberName} ${
                          member.role === 'admin' ? '가구원으로 변경' : '관리자로 지정'
                        }`}
                        disabled={roleMemberId === member.id}
                        onPress={() => void toggleMemberRole(member.id, member.role)}
                        style={styles.roleButton}>
                        {member.role === 'admin' ? (
                          <ShieldMinus size={14} color={theme.textSecondary} strokeWidth={2} />
                        ) : (
                          <ShieldCheck size={14} color={theme.primary} strokeWidth={2} />
                        )}
                        <Text
                          style={[
                            styles.memberRole,
                            { color: member.role === 'admin' ? theme.textSecondary : theme.primary },
                          ]}>
                          {member.role === 'admin' ? '관리자' : '가구원'}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={[styles.memberRole, { color: theme.textSecondary }]}>
                        {member.role === 'admin' ? '관리자' : '가구원'}
                        {isCurrentMember ? ' · 나' : ''}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
            {householdError ? (
              <Text style={[styles.householdFeedback, { color: theme.danger }]}>
                {householdError}
              </Text>
            ) : null}
            {householdMessage ? (
              <Text style={[styles.householdFeedback, { color: theme.primary }]}>
                {householdMessage}
              </Text>
            ) : null}

            <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>알림 설정</Text>
            <View
              style={[
                styles.panel,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={[styles.settingRow, { borderBottomColor: theme.border }]}>
                <Text style={[styles.settingText, { color: theme.text }]}>유통기한 알림</Text>
                <Switch
                  value={expiryEnabled}
                  onValueChange={(value) => updateReminder('expiry', value)}
                  trackColor={{ false: theme.border, true: theme.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={[styles.settingRow, styles.settingRowLast]}>
                <Text style={[styles.settingText, { color: theme.text }]}>집안일 리마인드</Text>
                <Switch
                  value={choreEnabled}
                  onValueChange={(value) => updateReminder('chore', value)}
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
                  <Text testID="profile-invite-code">{household.inviteCode || '없음'}</Text>
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
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 20,
  },
  householdHeader: {
    minHeight: 58,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  householdHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  householdName: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  householdCount: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  householdNameForm: {
    borderBottomWidth: 1,
    gap: 10,
    paddingVertical: 12,
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
  roleButton: {
    minHeight: 32,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  householdFeedback: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    marginTop: -12,
    marginBottom: 18,
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
