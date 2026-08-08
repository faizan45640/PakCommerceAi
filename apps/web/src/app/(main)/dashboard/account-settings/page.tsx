// page.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AccountKpiCards } from "./_components/account-kpi-cards";
import { ConnectedStores } from "./_components/connected-stores";
import { NotificationCenter } from "./_components/notification-center";
import { LanguageToggle } from "./_components/language-toggle";
import { PrivacySettings } from "./_components/privacy-settings";
import { AccountProfile } from "./_components/account-profile";
import { SystemStatus } from "./_components/system-status";
import { QuickActions } from "./_components/quick-actions";

export default function Page() {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">Account Settings & Management</h1>
        <p className="text-muted-foreground text-sm">
          Manage your connected stores, notifications, language preferences, and privacy settings all in one place.
        </p>
      </div>

      <AccountKpiCards />

      <Tabs defaultValue="stores" className="flex flex-col gap-4">
        <TabsList className="gap-1">
          <TabsTrigger value="stores">Stores & Channels</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="language">Language</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="stores" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4">
            <ConnectedStores />
          </div>
        </TabsContent>

        <TabsContent value="notifications" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4">
            <NotificationCenter />
          </div>
        </TabsContent>

        <TabsContent value="language" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-6">
              <LanguageToggle />
            </div>
            <div className="xl:col-span-6">
              <QuickActions />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="privacy" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4">
            <PrivacySettings />
          </div>
        </TabsContent>

        <TabsContent value="account" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-6">
              <AccountProfile />
            </div>
            <div className="xl:col-span-6">
              <QuickActions />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="system" className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4">
            <SystemStatus />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}