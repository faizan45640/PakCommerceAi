/** Which WhatsApp vendor is active. Provider-specific env lives in each adapter. */

export type WhatsAppProviderName = "meta" | "twilio" | "simulator";

/**
 * `WHATSAPP_PROVIDER`; anything other than `twilio` or `simulator` keeps the
 * default, Meta. `simulator` sends nothing over the network (local demos/tests).
 */
export function getWhatsAppProviderName(env: NodeJS.ProcessEnv = process.env): WhatsAppProviderName {
  const name = env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  return name === "twilio" || name === "simulator" ? name : "meta";
}
