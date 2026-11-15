import { salesAgentSettingsInputSchema } from "@pakcommerce/shared/conversations";
import { Router } from "express";
import { z } from "zod";

import { parseOrThrow } from "../lib/parse-or-throw.js";
import { sellerContext } from "../middleware/seller-context.js";
import { getSalesAgentSettings, saveSalesAgentSettings } from "./settings-service.js";

/** `GET/PUT /api/v1/sales-agent/settings`. Seller token, RLS-scoped. */
export const salesAgentRouter = Router();

const querySchema = z.object({ workspaceId: z.uuid() });

salesAgentRouter.get("/settings", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const { workspaceId } = parseOrThrow(querySchema, request.query, "settings query");
    response.json({ data: await getSalesAgentSettings(auth, workspaceId) });
  } catch (error) {
    next(error);
  }
});

salesAgentRouter.put("/settings", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const input = parseOrThrow(salesAgentSettingsInputSchema, request.body, "sales agent settings");
    response.json({ data: await saveSalesAgentSettings(auth, input) });
  } catch (error) {
    next(error);
  }
});
