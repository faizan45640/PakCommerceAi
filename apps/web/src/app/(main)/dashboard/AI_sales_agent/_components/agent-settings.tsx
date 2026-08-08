// agent-settings.tsx
"use client";

import { ArrowRight, Bot, Settings, ToggleLeft, ToggleRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function AgentSettings() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings className="size-4 text-muted-foreground" />
          Agent Settings
        </CardTitle>
        <CardAction className="flex items-center gap-1 text-muted-foreground text-xs">
          <Button size="sm" className="h-7 text-xs">
            Save Changes
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-respond" className="text-sm">Auto-respond to new messages</Label>
            <Switch id="auto-respond" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="create-draft" className="text-sm">Auto-create draft orders</Label>
            <Switch id="create-draft" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="handoff-alerts" className="text-sm">Enable human handoff alerts</Label>
            <Switch id="handoff-alerts" defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="confidence-track" className="text-sm">Track confidence scores</Label>
            <Switch id="confidence-track" defaultChecked />
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Confidence threshold</Label>
              <div className="text-xs text-muted-foreground">Minimum confidence for auto-approval</div>
            </div>
            <div className="flex items-center gap-2">
              <Input type="number" defaultValue={75} className="w-16 h-8 text-center" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Max auto-approval amount</Label>
              <div className="text-xs text-muted-foreground">Maximum order value for auto-approval</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">$</span>
              <Input type="number" defaultValue={200} className="w-20 h-8 text-center" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}