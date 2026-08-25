import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { Spacing } from '@/constants/theme';
import { HOUSEHOLD_NAME_MAX_LENGTH, validateHouseholdName } from '@/domain/household-settings';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';

type SetupMode = 'choice' | 'create' | 'join';

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
  const [confirmingCreate, setConfirmingCreate] = useState(false);
  const [mode, setMode] = useState<SetupMode>('choice');

  const requestCreate = () => {
    const nameError = validateHouseholdName(householdName);
    if (nameError) {
      setFormError(nameError);
      return;
    }

    setFormError(null);
    setConfirmingCreate(true);
  };

  const create = async () => {
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

  const selectMode = (nextMode: Exclude<SetupMode, 'choice'>) => {
    setMode(nextMode);
    setFormError(null);
    setConfirmingCreate(false);
  };

  const returnToChoice = () => {
    setMode('choice');
    setFormError(null);
    setConfirmingCreate(false);
  };

  return (
    <Screen
      eyebrow={`처음 시작하기 · ${mode === 'choice' ? '1' : '2'}/2`}
      title={mode === 'choice' ? '우리집 생활을 시작해요' : '우리집을 연결해요'}
      description={
        mode === 'choice'
          ? `${currentUser?.displayName ?? '사용자'}님, 함께 관리할 가구가 있나요?`
          : mode === 'create'
            ? '새 가구의 이름을 정하면 초대 코드를 바로 만들어요.'
            : '가구원에게 받은 초대 코드로 같은 생활 공간을 연결해요.'
      }>
      {mode === 'choice' ? (
        <Card title="어떻게 시작할까요?">
          <View style={styles.choiceList}>
            <View style={styles.choice}>
              <Text style={[styles.choiceTitle, { color: theme.text }]}>처음 가구를 만들어요</Text>
              <Text style={[styles.choiceDescription, { color: theme.textSecondary }]}>
                가구명을 정하고 함께할 사람을 초대할 수 있어요.
              </Text>
              <ActionButton testID="household-onboarding-create-button" onPress={() => selectMode('create')}>
                새 가구 만들기
              </ActionButton>
            </View>
            <View style={[styles.choiceDivider, { backgroundColor: theme.border }]} />
            <View style={styles.choice}>
              <Text style={[styles.choiceTitle, { color: theme.text }]}>초대를 받았어요</Text>
              <Text style={[styles.choiceDescription, { color: theme.textSecondary }]}>
                전달받은 코드로 기존 가구에 참여할 수 있어요.
              </Text>
              <ActionButton
                testID="household-onboarding-join-button"
                variant="secondary"
                onPress={() => selectMode('join')}>
                초대 코드 입력
              </ActionButton>
            </View>
          </View>
        </Card>
      ) : null}

      {mode === 'create' ? (
        <Card title="새 가구 만들기">
          <View style={styles.form}>
            <FormField
              label="가구 이름"
              value={householdName}
              onChangeText={(value) => {
                setHouseholdName(value);
                setFormError(null);
                setConfirmingCreate(false);
              }}
              placeholder="예: 우리집"
              maxLength={HOUSEHOLD_NAME_MAX_LENGTH}
              testID="household-name-input"
            />
            {confirmingCreate ? (
              <View style={styles.confirmation}>
                <Text style={[styles.confirmationText, { color: theme.textSecondary }]}>
                  ‘{householdName.trim()}’ 가구를 새로 만들까요?
                </Text>
                <View style={styles.confirmationActions}>
                  <ActionButton
                    testID="household-create-cancel-button"
                    variant="secondary"
                    onPress={() => setConfirmingCreate(false)}
                    disabled={submitting}
                    style={styles.confirmationAction}>
                    취소
                  </ActionButton>
                  <ActionButton
                    testID="household-create-confirm-button"
                    onPress={() => void create()}
                    disabled={submitting}
                    style={styles.confirmationAction}>
                    {submitting ? '처리 중' : '새로 만들기'}
                  </ActionButton>
                </View>
              </View>
            ) : (
              <ActionButton
                testID="household-create-button"
                onPress={requestCreate}
                disabled={submitting || !householdName.trim()}>
                가구 만들기
              </ActionButton>
            )}
          </View>
        </Card>
      ) : null}

      {mode === 'join' ? (
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
              maxLength={8}
              testID="household-invite-code-input"
            />
            <ActionButton
              testID="household-join-button"
              onPress={join}
              disabled={submitting || !inviteCode.trim()}>
              {submitting ? '처리 중' : '참여하기'}
            </ActionButton>
          </View>
        </Card>
      ) : null}

      {formError ? <Text style={[styles.error, { color: theme.danger }]}>{formError}</Text> : null}
      {errorMessage ? <Text style={[styles.error, { color: theme.danger }]}>{errorMessage}</Text> : null}

      {mode !== 'choice' ? (
        <ActionButton
          testID="household-onboarding-back-button"
          variant="secondary"
          onPress={returnToChoice}
          disabled={submitting}>
          다른 방법 선택
        </ActionButton>
      ) : null}
      <ActionButton testID="household-sign-out-button" variant="secondary" onPress={signOut}>
        로그아웃
      </ActionButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  choiceList: {
    gap: Spacing.four,
  },
  choice: {
    gap: Spacing.two,
  },
  choiceTitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  choiceDescription: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: Spacing.one,
  },
  choiceDivider: {
    height: 1,
  },
  form: {
    gap: Spacing.two,
  },
  confirmation: {
    gap: Spacing.one,
  },
  confirmationText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  confirmationActions: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  confirmationAction: {
    flex: 1,
  },
  error: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
});
