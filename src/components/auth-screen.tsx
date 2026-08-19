import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/components/app/action-button';
import { Card } from '@/components/app/card';
import { FormField } from '@/components/app/form-field';
import { Screen } from '@/components/app/screen';
import { Spacing } from '@/constants/theme';
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
  const [autoLogin, setAutoLogin] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

    setFormError(null);
    setSubmitting(true);
    try {
      if (mode === 'signIn') {
        await signInWithEmail(trimmedEmail, password, autoLogin);
      } else {
        await signUpWithEmail(trimmedEmail, password, displayName);
      }
    } catch {
      // Store actions expose the message through errorMessage.
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
            autoComplete="username"
            textContentType="username"
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
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
            testID="auth-password-input"
          />
          {mode === 'signIn' && Platform.OS === 'web' ? (
            <View style={styles.loginOptions}>
              <Pressable
                testID="auth-auto-login-toggle"
                accessibilityRole="checkbox"
                accessibilityLabel="자동 로그인"
                accessibilityState={{ checked: autoLogin }}
                onPress={() => setAutoLogin((current) => !current)}
                style={styles.autoLoginOption}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: autoLogin ? theme.primary : theme.border,
                      backgroundColor: autoLogin ? theme.primary : theme.backgroundElement,
                    },
                  ]}>
                  {autoLogin ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={[styles.optionLabel, { color: theme.text }]}>자동 로그인</Text>
              </Pressable>
              <Text style={[styles.helper, { color: theme.textSecondary }]}>
                비밀번호 저장은 이 기기의 안전한 비밀번호 관리 기능을 사용해요.
              </Text>
            </View>
          ) : null}
          {formError ? <Text style={[styles.error, { color: theme.danger }]}>{formError}</Text> : null}
          {errorMessage ? <Text style={[styles.error, { color: theme.danger }]}>{errorMessage}</Text> : null}
          <ActionButton
            testID="auth-submit-button"
            onPress={submit}
            disabled={submitting || !email || !password}>
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
  loginOptions: {
    gap: Spacing.one,
  },
  autoLoginOption: {
    alignSelf: 'flex-start',
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  optionLabel: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  helper: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
});
