import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

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
  const signOut = useHouseholdStore((state) => state.signOut);
  const scheduleNotifications = useHouseholdStore((state) => state.scheduleNotifications);
  const cancelNotifications = useHouseholdStore((state) => state.cancelNotifications);
  const notificationMessage = useHouseholdStore((state) => state.notificationMessage);
  const [expiryEnabled, setExpiryEnabled] = useState(true);
  const [choreEnabled, setChoreEnabled] = useState(false);

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
                {household.inviteCode || '없음'}
              </Text>
              을 공유해서 가구원을 추가해요
            </Text>
          </View>

          <Pressable
            testID="profile-sign-out-button"
            accessibilityRole="button"
            onPress={signOut}
            style={styles.signOutButton}>
            <Text style={[styles.signOutText, { color: theme.textTertiary }]}>로그아웃</Text>
          </Pressable>
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
  signOutButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
