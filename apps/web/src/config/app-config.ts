import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "PakCommerce AI",
  version: packageJson.version,
  copyright: `© ${currentYear}, PakCommerce AI.`,
  meta: {
    title: "PakCommerce AI — Seller Operations Platform",
    description:
      "Manage commerce operations, inventory, orders, analytics, and AI-powered seller workflows from one platform.",
  },
};
