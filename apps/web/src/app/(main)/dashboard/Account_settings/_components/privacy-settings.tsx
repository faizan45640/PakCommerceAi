// privacy-settings.tsx
"use client";

import { useState } from "react";
import { ArrowRight, Eye, Lock, Shield, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function PrivacySettings() {
  const [settings, setSettings] = useState({
    aiAccess: true,
    customerData: true,
    orderHistory: true,
    analyticsSharing: false,
    personalization: true,
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Shield className="size-4 text-muted-foreground" />
          Data Privacy & Sharing Settings
        </CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button size="sm" className="h-7 text-xs">
            Save Settings
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-3">
          <div className="flex items-start gap-2">
            <Shield className="size-4 text-blue-500 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Privacy Status: Secure</div>
              <div className="text-xs text-muted-foreground">
                Your data is encrypted and stored securely. You control what the AI can access.
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">AI System Access</Label>
              <div className="text-xs text-muted-foreground">Allow AI to access business data for insights</div>
            </div>
            <Switch checked={settings.aiAccess} onCheckedChange={() => toggleSetting('aiAccess')} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Customer Data Usage</Label>
              <div className="text-xs text-muted-foreground">AI can analyze customer behavior and purchase history</div>
            </div>
            <Switch checked={settings.customerData} onCheckedChange={() => toggleSetting('customerData')} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Order History Analysis</Label>
              <div className="text-xs text-muted-foreground">AI can review past orders for pattern detection</div>
            </div>
            <Switch checked={settings.orderHistory} onCheckedChange={() => toggleSetting('orderHistory')} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Analytics Sharing</Label>
              <div className="text-xs text-muted-foreground">Share anonymized data for platform improvements</div>
            </div>
            <Switch checked={settings.analyticsSharing} onCheckedChange={() => toggleSetting('analyticsSharing')} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Personalization</Label>
              <div className="text-xs text-muted-foreground">AI can personalize recommendations and responses</div>
            </div>
            <Switch checked={settings.personalization} onCheckedChange={() => toggleSetting('personalization')} />
          </div>
        </div>

        <Separator />

        <div className="flex items-center gap-2">
          <Users className="size-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">128</span> customers have opted in for data sharing
          </span>
          <Badge variant="outline" className="text-[10px] ml-auto">
            GDPR Compliant
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}