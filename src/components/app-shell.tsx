import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { Card } from '@/components/app/card';
import { EmptyState } from '@/components/app/empty-state';
import { Screen } from '@/components/app/screen';
import { AuthScreen } from '@/components/auth-screen';
import { HouseholdSetupScreen } from '@/components/household-setup-screen';
import { useTheme } from '@/hooks/use-theme';
import { useHouseholdStore } from '@/store/household-store';

export function AppShell() {
  const theme = useTheme();
  const authStatus = useHouseholdStore((state) => state.authStatus);
  const dataStatus = useHouseholdStore((state) => state.dataStatus);
  const configIssues = useHouseholdStore((state) => state.configIssues);
  const errorMessage = useHouseholdStore((state) => state.errorMessage);
  const initializeSession = useHouseholdStore((state) => state.initializeSession);

  useEffect(() => initializeSession(), [initializeSession]);

  if (authStatus === 'mock') {
    return <AppTabs />;
  }

  if (authStatus === 'missing-config') {
    return (
      <Screen
        eyebrow="Firebase 설정 필요"
        title="환경변수를 연결해주세요"
        description="실제 로그인과 가구 공유를 사용하려면 Firebase 프로젝트 키가 필요해요.">
        <Card title="누락된 설정">
          {configIssues.map((issue) => (
            <Text key={issue} style={[styles.issue, { color: theme.text }]}>
              {issue}
            </Text>
          ))}
        </Card>
        <EmptyState
          title="임시로 확인하려면"
          description=".env.local에 EXPO_PUBLIC_USE_MOCKS=true를 넣으면 샘플 데이터 모드로 볼 수 있어요."
        />
      </Screen>
    );
  }

  if (authStatus === 'checking') {
    return <LoadingScreen label="로그인 상태를 확인하고 있어요." />;
  }

  if (authStatus === 'unauthenticated') {
    return <AuthScreen />;
  }

  if (dataStatus === 'empty') {
    return <HouseholdSetupScreen />;
  }

  if (dataStatus === 'loading' || dataStatus === 'idle') {
    return <LoadingScreen label="우리집 데이터를 불러오고 있어요." />;
  }

  if (dataStatus === 'error') {
    return (
      <Screen eyebrow="오류" title="데이터를 불러오지 못했어요" description={errorMessage ?? undefined}>
        <EmptyState title="잠시 후 다시 시도해주세요." />
      </Screen>
    );
  }

  return <AppTabs />;
}

function LoadingScreen({ label }: { label: string }) {
  const theme = useTheme();

  return (
    <Screen eyebrow="로딩 중" title="잠시만요" description={label}>
      <ActivityIndicator color={theme.primary} size="large" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  issue: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
});
