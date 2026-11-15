import { getWhatsAppProviderName, type WhatsAppProviderName } from "./config.js";
import { getMetaCloudConfig, MetaCloudProvider } from "./meta-cloud.js";
import type { WhatsAppProvider } from "./provider.js";
import { getTwilioConfig, TwilioProvider } from "./twilio.js";

export interface ActiveWhatsApp {
  name: WhatsAppProviderName;
  provider: WhatsAppProvider;
  /** Spike-only: the workspace that owns the connected number (`WHATSAPP_WORKSPACE_ID`). */
  workspaceId: string;
}

/** The configured adapter, or null when the selected provider's env is incomplete. */
export function getActiveWhatsApp(env: NodeJS.ProcessEnv = process.env): ActiveWhatsApp | null {
  const name = getWhatsAppProviderName(env);
  if (name === "twilio") {
    const config = getTwilioConfig(env);
    return config ? { name, provider: new TwilioProvider(config), workspaceId: config.workspaceId } : null;
  }
  const config = getMetaCloudConfig(env);
  return config ? { name, provider: new MetaCloudProvider(config), workspaceId: config.workspaceId } : null;
}
