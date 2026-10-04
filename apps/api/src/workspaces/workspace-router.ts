import { Router } from "express";

import { sellerContext } from "../products/seller-context.js";
import { getCurrentWorkspace, listWorkspaces } from "./workspace-service.js";

export const workspaceRouter = Router();

workspaceRouter.get("/current", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const workspace = await getCurrentWorkspace(auth);
    response.json({ data: workspace });
  } catch (error) {
    next(error);
  }
});

workspaceRouter.get("/", async (request, response, next) => {
  try {
    const auth = sellerContext(request);
    const workspaces = await listWorkspaces(auth);
    response.json({ data: workspaces });
  } catch (error) {
    next(error);
  }
});
