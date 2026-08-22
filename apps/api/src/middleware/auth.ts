import type { NextFunction, Request, Response } from "express";

export interface AuthContext {
  userId: string;
  email: string | null;
  accessToken: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export type TokenVerifier = (accessToken: string) => Promise<{
  id: string;
  email: string | null;
}>;

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  return token;
}

export function requireAuth(verifyToken: TokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = extractBearerToken(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        error: {
          code: "unauthorized",
          message: "Missing bearer token.",
        },
      });
      return;
    }

    try {
      const user = await verifyToken(token);

      req.auth = {
        userId: user.id,
        email: user.email,
        accessToken: token,
      };
      next();
    } catch {
      res.status(401).json({
        error: {
          code: "unauthorized",
          message: "Invalid or expired token.",
        },
      });
    }
  };
}
