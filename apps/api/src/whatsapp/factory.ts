import { getWhatsAppProviderName, type WhatsAppProviderName } from "./config.js";
import { getMetaCloudConfig, MetaCloudProvider } from "./meta-cloud.js";
import type { WhatsAppProvider } from "./provider.js";
import { SimulatorProvider } from "./simulator.js";
import { getTwilioConfig, TwilioProvider } from "./twilio.js";

export interface ActiveWhatsApp {
  name: WhatsAppProviderName;
  provider: WhatsAppProvider;
  /**
   * Spike-only: the workspace that owns the connected number (`WHATSAPP_WORKSPACE_ID`).
   * Null (simulator without the variable) means any workspace may send.
   */
  workspaceId: string | null;
}

// One instance, so the simulator's record of sent messages survives between calls.
let simulator: SimulatorProvider | null = null;

/** The configured adapter, or null when the selected provider's env is incomplete. */
export function getActiveWhatsApp(env: NodeJS.ProcessEnv = process.env): ActiveWhatsApp | null {
  const name = getWhatsAppProviderName(env);
  if (name === "simulator") {
    simulator ??= new SimulatorProvider();
    return { name, provider: simulator, workspaceId: env.WHATSAPP_WORKSPACE_ID?.trim() || null };
  }
  if (name === "twilio") {
    const config = getTwilioConfig(env);
    return config ? { name, provider: new TwilioProvider(config), workspaceId: config.workspaceId } : null;
  }
  const config = getMetaCloudConfig(env);
  return config ? { name, provider: new MetaCloudProvider(config), workspaceId: config.workspaceId } : null;
}
