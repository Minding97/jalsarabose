import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { Spacing } from '@/constants/theme';
import {
  MAX_SIGN_IN_ATTEMPTS,
  getSignInErrorKind,
  getSignInErrorMessage,
} from '@/domain/auth-errors';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';

export function AuthScreen() {
  const theme = useTheme();
  const signInWithEmail = useHouseholdStore((state) => state.signInWithEmail);
  const signUpWithEmail = useHouseholdStore((state) => state.signUpWithEmail);
  const errorMessage = useHouseholdStore((state) => state.errorMessage);
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failedPasswordAttempts, setFailedPasswordAttempts] = useState<Record<string, number>>({});

  const emailKey = email.trim().toLowerCase();
  const currentFailedPasswordAttempts = failedPasswordAttempts[emailKey] ?? 0;
  const signInAttemptLimitReached =
    mode === 'signIn' && currentFailedPasswordAttempts >= MAX_SIGN_IN_ATTEMPTS;

  const submit = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail.includes('@')) {
      setFormError('이메일 형식을 확인해주세요.');
      return;
    }

    if (password.length < 6) {
      setFormError('비밀번호는 6자 이상 입력해주세요.');
      return;
    }

    if (mode === 'signUp' && !displayName.trim()) {
      setFormError('가구원에게 보일 이름을 입력해주세요.');
      return;
    }

    if (mode === 'signIn' && currentFailedPasswordAttempts >= MAX_SIGN_IN_ATTEMPTS) {
      Alert.alert('로그인 실패', '로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    setFormError(null);
    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        await signInWithEmail(trimmedEmail, password);
      } else {
        await signUpWithEmail(trimmedEmail, password, displayName);
      }
    } catch (error) {
      if (mode === 'signIn') {
        const message = getSignInErrorMessage(error);

        if (getSignInErrorKind(error) === 'wrong-password') {
          const nextFailedAttempts = Math.min(
            currentFailedPasswordAttempts + 1,
            MAX_SIGN_IN_ATTEMPTS,
          );
          setFailedPasswordAttempts((current) => ({
            ...current,
            [trimmedEmail.toLowerCase()]: nextFailedAttempts,
          }));

          Alert.alert(
            '로그인 실패',
            nextFailedAttempts >= MAX_SIGN_IN_ATTEMPTS
              ? `${message}\n로그인 시도 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.`
              : `${message}\n남은 시도 횟수: ${MAX_SIGN_IN_ATTEMPTS - nextFailedAttempts}회`,
          );
        } else {
          Alert.alert('로그인 실패', message);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      eyebrow="시작하기"
      title="잘살아보세"
      description="같이 사는 생활을 한 곳에서 관리하려면 먼저 로그인해주세요.">
      <Card title={mode === 'signIn' ? '로그인' : '회원가입'}>
        <View style={styles.form}>
          {mode === 'signUp' ? (
            <FormField
              label="이름"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="가구원에게 보일 이름"
              testID="auth-display-name-input"
            />
          ) : null}
          <FormField
            label="이메일"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setFormError(null);
            }}
            placeholder="you@example.com"
            keyboardType="email-address"
            testID="auth-email-input"
          />
          <FormField
            label="비밀번호"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setFormError(null);
            }}
            placeholder="6자 이상"
            secureTextEntry
            testID="auth-password-input"
          />
          {formError ? <Text style={[styles.error, { color: theme.danger }]}>{formError}</Text> : null}
          {mode === 'signUp' && errorMessage ? (
            <Text style={[styles.error, { color: theme.danger }]}>{errorMessage}</Text>
          ) : null}
          <ActionButton
            testID="auth-submit-button"
            onPress={submit}
            disabled={submitting || !email || !password || signInAttemptLimitReached}>
            {submitting ? '처리 중' : mode === 'signIn' ? '로그인' : '회원가입'}
          </ActionButton>
          <ActionButton
            testID="auth-mode-toggle-button"
            variant="secondary"
            onPress={() => {
              setFormError(null);
              setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
            }}>
            {mode === 'signIn' ? '계정 만들기' : '이미 계정이 있어요'}
          </ActionButton>
        </View>
      </Card>
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
