import { PrismaClient, UserRole } from "@prisma/client";
import { prisma } from "./prisma";
import { verifyToken } from "./auth/jwt";

export interface GraphQLContext {
  prisma: PrismaClient;
  user: { userId: string; role: UserRole; email: string } | null;
}

export async function createContext(request: Request): Promise<GraphQLContext> {
  const authHeader = request.headers.get("authorization") || "";
  let user = null;
  if (authHeader.startsWith("Bearer ")) {
    user = verifyToken(authHeader.substring(7));
  }
  return { prisma, user };
}
