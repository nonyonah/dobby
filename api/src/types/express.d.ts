import type { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      auth?: { userId: string };
    }
  }
}

export type AuthenticatedRequest = Request & {
  auth: { userId: string };
};
