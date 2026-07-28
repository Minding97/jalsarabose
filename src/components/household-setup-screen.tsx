import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';

export function HouseholdSetupScreen() {
  const theme = useTheme();
  const createNewHousehold = useHouseholdStore((state) => state.createNewHousehold);
  const joinHousehold = useHouseholdStore((state) => state.joinHousehold);
  const signOut = useHouseholdStore((state) => state.signOut);
  const currentUser = useHouseholdStore((state) => state.currentUser);
  const errorMessage = useHouseholdStore((state) => state.errorMessage);
  const [householdName, setHouseholdName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const create = async () => {
    if (householdName.trim().length < 2) {
      setFormError('가구 이름은 2자 이상 입력해주세요.');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await createNewHousehold(householdName);
    } catch {
      // Store actions expose the message through errorMessage.
    } finally {
      setSubmitting(false);
    }
  };

  const join = async () => {
    const normalizedCode = inviteCode.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,8}$/.test(normalizedCode)) {
      setFormError('초대 코드는 6~8자리 대문자/숫자로 입력해주세요.');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      await joinHousehold(normalizedCode);
    } catch {
      // Store actions expose the message through errorMessage.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      eyebrow="가구 설정"
      title="우리집을 연결해요"
      description={`${currentUser?.displayName ?? '사용자'}님이 함께 관리할 가구를 만들거나 초대 코드로 참여하세요.`}>
      <Card title="새 가구 만들기">
        <View style={styles.form}>
          <FormField
            label="가구 이름"
            value={householdName}
            onChangeText={(value) => {
              setHouseholdName(value);
              setFormError(null);
            }}
            placeholder="예: 우리집"
            testID="household-name-input"
          />
          <ActionButton
            testID="household-create-button"
            onPress={create}
            disabled={submitting || !householdName.trim()}>
            {submitting ? '처리 중' : '가구 만들기'}
          </ActionButton>
        </View>
      </Card>

      <Card title="초대 코드로 참여">
        <View style={styles.form}>
          <FormField
            label="초대 코드"
            value={inviteCode}
            onChangeText={(value) => {
              setInviteCode(value.toUpperCase());
              setFormError(null);
            }}
            placeholder="예: JALSAL"
            autoCapitalize="characters"
            testID="household-invite-code-input"
          />
          <ActionButton
            testID="household-join-button"
            variant="secondary"
            onPress={join}
            disabled={submitting || !inviteCode.trim()}>
            {submitting ? '처리 중' : '참여하기'}
          </ActionButton>
        </View>
      </Card>

      {formError ? <Text style={[styles.error, { color: theme.danger }]}>{formError}</Text> : null}
      {errorMessage ? <Text style={[styles.error, { color: theme.danger }]}>{errorMessage}</Text> : null}

      <ActionButton testID="household-sign-out-button" variant="secondary" onPress={signOut}>
        로그아웃
      </ActionButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.two,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
