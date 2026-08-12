import { Tabs } from 'expo-router';
import { CalendarDays, House, ReceiptText, Refrigerator } from 'lucide-react-native';
import { ColorValue, Platform, StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const colors = Colors.light;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarAllowFontScaling: false,
        tabBarLabelPosition: 'below-icon',
        tabBarItemStyle: styles.tabItem,
        tabBarStyle: {
          backgroundColor: colors.backgroundElement,
          borderTopColor: colors.border,
          height: Platform.OS === 'web' ? 78 : 72,
          paddingBottom: Platform.OS === 'web' ? 18 : 12,
          paddingTop: 8,
          width: '100%',
          maxWidth: 402,
          alignSelf: 'center',
        },
        sceneStyle: { backgroundColor: colors.frameOutside },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarLabel: ({ color }) => <TabLabel color={color}>홈</TabLabel>,
          tabBarIcon: ({ color, size }) => <House color={color} size={size} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: '캘린더',
          tabBarLabel: ({ color }) => <TabLabel color={color}>캘린더</TabLabel>,
          tabBarIcon: ({ color, size }) => (
            <CalendarDays color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: '지출',
          tabBarLabel: ({ color }) => <TabLabel color={color}>지출</TabLabel>,
          tabBarIcon: ({ color, size }) => (
            <ReceiptText color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
      <Tabs.Screen
        name="chores"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="fridge"
        options={{
          title: '냉장고',
          tabBarLabel: ({ color }) => <TabLabel color={color}>냉장고</TabLabel>,
          tabBarIcon: ({ color, size }) => (
            <Refrigerator color={color} size={size} strokeWidth={2.2} />
          ),
        }}
      />
    </Tabs>
  );
}

function TabLabel({ color, children }: { color: ColorValue; children: string }) {
  return (
    <Text allowFontScaling={false} style={[styles.tabLabel, { color }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  tabItem: {
    minWidth: 0,
    paddingHorizontal: 2,
  },
  tabLabel: {
    width: '100%',
    flexShrink: 0,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
  },
});
