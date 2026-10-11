import { Tabs } from 'expo-router';
import { TabIcon } from '../../components/tab-icons';
import { theme } from '../../components/theme';
import { TAB_ORDER, tabsFor, type Tab } from '../../features/navigation';
import { WithActiveCompany } from '../../screens/with-active-company';

const p = theme.palette;

const TAB_TITLES: Record<Tab, string> = {
  inbox: 'Inbox',
  requests: 'Requests',
  orders: 'Orders',
  suppliers: 'Suppliers',
  company: 'Company',
};

export default function TabsLayout() {
  return (
    <WithActiveCompany>
      {(active) => {
        const tabs = tabsFor([active.role]);
        return (
          <Tabs
            screenOptions={{
              tabBarActiveTintColor: p.accent,
              tabBarInactiveTintColor: p.muted,
              tabBarStyle: {
                backgroundColor: p.surface,
                borderTopColor: p.line,
                height: 64,
              },
              tabBarItemStyle: { minHeight: 52 },
              tabBarLabelStyle: { fontSize: 11 },
              headerShown: false,
            }}
          >
            <Tabs.Screen name="index" options={{ href: null }} />
            {TAB_ORDER.map((tab) => (
              <Tabs.Screen
                key={tab}
                name={tab}
                options={{
                  title: TAB_TITLES[tab],
                  href: tabs.includes(tab) ? undefined : null,
                  tabBarIcon: ({ color }) => (
                    <TabIcon tab={tab} color={color} />
                  ),
                }}
              />
            ))}
          </Tabs>
        );
      }}
    </WithActiveCompany>
  );
}
