import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "PakCommerceAi",
  version: packageJson.version,
  copyright: `© ${currentYear}, PakCommerceAi.`,
  meta: {
    title: "PakCommerceAi - Modern Next.js Dashboard Starter Template",
    description:
      "PakCommerceAi is a  AI-powered platform to help Pakistani sellers manage inventory, orders, WhatsApp sales, and courier logistics in one place.",
  },
};
