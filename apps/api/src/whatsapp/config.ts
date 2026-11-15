/** Which WhatsApp vendor is active. Provider-specific env lives in each adapter. */

export type WhatsAppProviderName = "meta" | "twilio";

/** `WHATSAPP_PROVIDER`; anything other than `twilio` keeps the default, Meta. */
export function getWhatsAppProviderName(env: NodeJS.ProcessEnv = process.env): WhatsAppProviderName {
  return env.WHATSAPP_PROVIDER?.trim().toLowerCase() === "twilio" ? "twilio" : "meta";
}
