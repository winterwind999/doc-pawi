import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';

import { AvatarMenu } from '@/components/AvatarMenu';
import { colors } from '@/theme/colors';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const TABS: { name: string; title: string; icon: IconName; focusedIcon: IconName }[] = [
  { name: 'index', title: 'Home', icon: 'home-variant-outline', focusedIcon: 'home-variant' },
  { name: 'chats', title: 'Chats', icon: 'chat-processing-outline', focusedIcon: 'chat-processing' },
  { name: 'records', title: 'Records', icon: 'folder-heart-outline', focusedIcon: 'folder-heart' },
  { name: 'meds', title: 'Meds', icon: 'pill', focusedIcon: 'pill' },
  { name: 'doctors', title: 'Doctors', icon: 'stethoscope', focusedIcon: 'stethoscope' },
  { name: 'hmo', title: 'HMO', icon: 'card-account-details-outline', focusedIcon: 'card-account-details' },
];

/** Six bottom-navigation destinations (JS tabs: Android's native bottom navigation is limited to five). */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary700,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 64, paddingTop: 6 },
        headerStyle: { backgroundColor: colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', color: colors.ink },
        headerRight: () => <AvatarMenu />,
        sceneStyle: { backgroundColor: colors.surfaceMuted },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.name === 'index' ? 'Doc Pawi' : tab.title,
            tabBarLabel: tab.title,
            tabBarAccessibilityLabel: `${tab.title} tab`,
            tabBarIcon: ({ color, focused }) => (
              <MaterialCommunityIcons name={focused ? tab.focusedIcon : tab.icon} size={24} color={color} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
