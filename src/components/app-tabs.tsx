import { Tabs } from 'expo-router';
import { CalendarDays, ClipboardCheck, House, ReceiptText, Refrigerator } from 'lucide-react-native';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: {
          backgroundColor: colors.backgroundElement,
          borderTopColor: colors.border,
          height: 72,
          paddingBottom: 12,
          paddingTop: 8,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color, size }) => <House color={color} size={size} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: '캘린더',
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: '지출',
          tabBarIcon: ({ color, size }) => (
            <ReceiptText color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          title: '집안일',
          tabBarIcon: ({ color, size }) => (
            <ClipboardCheck color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="fridge"
        options={{
          title: '냉장고',
          tabBarIcon: ({ color, size }) => (
            <Refrigerator color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
    </Tabs>
  );
}
