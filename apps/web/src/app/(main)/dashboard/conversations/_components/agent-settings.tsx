// agent-settings.tsx
"use client";

import * as React from "react";
import { Settings } from "lucide-react";
import { MAX_POLICY_TEXT_LENGTH } from "@pakcommerce/shared/conversations";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiRequestError } from "@/lib/api/api-client";
import { minorToRupeesInput, rupeesInputToMinor } from "./agent-settings-model";
import { fetchCurrentWorkspace } from "@/lib/api/products";
import { fetchSalesAgentSettings, saveSalesAgentSettings, type SalesAgentSettings } from "@/lib/api/sales-agent";

const POLICY_PLACEHOLDER = `Delivery: Lahore 2-3 days, other cities 4-6 days. Charges Rs 200, free above Rs 5000.
Returns: 7 days if unused and in original packing.
Payment: Cash on delivery available; bank transfer and JazzCash accepted.`;

export function AgentSettings() {
  const [workspaceId, setWorkspaceId] = React.useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = React.useState(false);
  const [policyText, setPolicyText] = React.useState("");
  const [autoConfirm, setAutoConfirm] = React.useState(true);
  const [shippingRs, setShippingRs] = React.useState("0");
  const [saved, setSaved] = React.useState({
    aiEnabled: false,
    policyText: "",
    autoConfirmOrders: true,
    shippingMinor: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const workspace = await fetchCurrentWorkspace();
        const settings = await fetchSalesAgentSettings(workspace.id);
        if (cancelled) return;
        setWorkspaceId(workspace.id);
        setAiEnabled(settings.aiEnabled);
        setPolicyText(settings.policyText);
        applySaved(settings);
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof ApiRequestError ? error.message : "Could not load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function applySaved(settings: SalesAgentSettings) {
    setAiEnabled(settings.aiEnabled);
    setPolicyText(settings.policyText);
    setAutoConfirm(settings.autoConfirmOrders ?? true);
    setShippingRs(minorToRupeesInput(settings.shippingFee?.amountMinor ?? 0));
    setSaved({
      aiEnabled: settings.aiEnabled,
      policyText: settings.policyText,
      autoConfirmOrders: settings.autoConfirmOrders ?? true,
      shippingMinor: settings.shippingFee?.amountMinor ?? 0,
    });
  }

  const shippingMinor = rupeesInputToMinor(shippingRs);
  const dirty =
    aiEnabled !== saved.aiEnabled ||
    policyText.trim() !== saved.policyText.trim() ||
    autoConfirm !== saved.autoConfirmOrders ||
    (shippingMinor !== null && shippingMinor !== saved.shippingMinor);
  const canSave = !!workspaceId && dirty && shippingMinor !== null && !saving && !loading;

  async function save() {
    if (!workspaceId || shippingMinor === null) return;
    setSaving(true);
    try {
      const next = await saveSalesAgentSettings({
        workspaceId,
        aiEnabled,
        policyText,
        autoConfirmOrders: autoConfirm,
        shippingFee: { amountMinor: shippingMinor, currency: "PKR" },
      });
      applySaved(next);
      toast.success("Agent settings saved");
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings className="size-4 text-muted-foreground" />
          Agent Settings
        </CardTitle>
        <CardAction>
          <Button size="sm" className="h-7 text-xs" disabled={!canSave} onClick={save}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? <p className="text-destructive text-xs">{loadError}</p> : null}

        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="ai-replies" className="text-sm">
              AI replies
            </Label>
            <p className="text-muted-foreground text-xs">
              New and reopened conversations are answered by the AI. It hands over to you when unsure.
            </p>
          </div>
          <Switch
            id="ai-replies"
            checked={aiEnabled}
            onCheckedChange={setAiEnabled}
            disabled={loading || !!loadError}
          />
        </div>

        <Separator />

        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="auto-confirm" className="text-sm">
              Auto-confirm orders the buyer confirms twice
            </Label>
            <p className="text-muted-foreground text-xs">
              On: the AI confirms the order and stock is deducted. Off: you approve each AI order before it is
              confirmed.
            </p>
          </div>
          <Switch
            id="auto-confirm"
            checked={autoConfirm}
            onCheckedChange={setAutoConfirm}
            disabled={loading || !!loadError}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="delivery-charge" className="text-sm">
            Delivery charge (Rs)
          </Label>
          <Input
            id="delivery-charge"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={shippingRs}
            onChange={(event) => setShippingRs(event.target.value)}
            aria-invalid={shippingMinor === null}
            disabled={loading || !!loadError}
          />
          {shippingMinor === null ? (
            <p className="text-destructive text-xs">Enter an amount of 0 or more.</p>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="store-policy" className="text-sm">
            Store policy
          </Label>
          <p className="text-muted-foreground text-xs">
            Delivery times, returns, payment and COD. The AI only quotes this text; without it, policy questions go
            to you.
          </p>
          <Textarea
            id="store-policy"
            rows={8}
            maxLength={MAX_POLICY_TEXT_LENGTH}
            placeholder={POLICY_PLACEHOLDER}
            value={policyText}
            onChange={(event) => setPolicyText(event.target.value)}
            disabled={loading || !!loadError}
          />
          <div className="text-right text-muted-foreground text-xs">
            {policyText.length}/{MAX_POLICY_TEXT_LENGTH}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
