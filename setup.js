import fs from "node:fs";
import path from "node:path";

const files = {
  "package.json": `{
  "name": "support-ticket-tracker",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "bun run --watch src/server.ts",
    "start": "bun run src/server.ts",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "bun run prisma/seed.ts",
    "db:reset": "prisma migrate reset",
    "gendb": "prisma generate && prisma migrate dev",
    "test": "bun test",
    "test:unit": "bun test tests/unit",
    "test:integration": "bun test tests/integration"
  },
  "dependencies": {
    "@prisma/client": "^6.9.0",
    "graphql": "^16.11.0",
    "graphql-yoga": "^5.13.4"
  },
  "devDependencies": {
    "@types/bun": "^1.2.15",
    "prisma": "^6.9.0"
  }
}`,

  "tsconfig.json": `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": ".",
    "resolveJsonModule": true,
    "noUncheckedIndexedAccess": true,
    "types": ["@types/bun"]
  },
  "include": ["src/**/*", "prisma/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist", "frontend"]
}`,

  "docker-compose.yml": `services:
  postgres:
    image: postgres:16-alpine
    container_name: sla-tracker-db
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: sla_tracker
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
`,

  ".env": `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sla_tracker?schema=public"
JWT_SECRET="dev-secret-do-not-use-in-production"
BUSINESS_TIMEZONE="Asia/Kolkata"
`,

  ".env.example": `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sla_tracker?schema=public"
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
BUSINESS_TIMEZONE="Asia/Kolkata"
`,

  ".gitignore": `node_modules/
dist/
.env
*.log
.DS_Store
frontend/node_modules/
frontend/dist/
`,

  "prisma/schema.prisma": `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  REPORTER
  AGENT
}

enum Priority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum TicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
  CLOSED
}

model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  role         UserRole
  createdAt    DateTime @default(now())

  reportedTickets Ticket[]  @relation("Reporter")
  assignedTickets Ticket[]  @relation("Assignee")
  comments        Comment[]
}

model Ticket {
  id          String       @id @default(uuid())
  title       String
  description String
  priority    Priority
  status      TicketStatus @default(OPEN)

  reporterId String
  reporter   User    @relation("Reporter", fields: [reporterId], references: [id])

  assigneeId String?
  assignee   User?   @relation("Assignee", fields: [assigneeId], references: [id])

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  firstResponseAt DateTime?
  resolvedAt      DateTime?

  firstResponseDueAt DateTime
  resolutionDueAt    DateTime

  comments Comment[]

  @@index([status])
  @@index([priority])
  @@index([assigneeId])
  @@index([createdAt])
}

model Comment {
  id      String @id @default(uuid())
  content String

  ticketId String
  ticket   Ticket @relation(fields: [ticketId], references: [id])

  authorId String
  author   User   @relation(fields: [authorId], references: [id])

  createdAt DateTime @default(now())

  @@index([ticketId])
}

model Holiday {
  id   String   @id @default(uuid())
  date DateTime @db.Date
  name String

  @@unique([date])
}
`,

  "src/prisma.ts": `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
`,

  "src/utils/errors.ts": `import { GraphQLError } from "graphql";

export function appError(message: string, code: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code },
  });
}
`,

  "src/utils/validation.ts": `import { appError } from "./errors";

export function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw appError("Ticket title cannot be empty", "VALIDATION_ERROR");
  if (trimmed.length > 255) throw appError("Ticket title must not exceed 255 characters", "VALIDATION_ERROR");
  return trimmed;
}

export function validateDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) throw appError("Ticket description cannot be empty", "VALIDATION_ERROR");
  if (trimmed.length > 5000) throw appError("Ticket description must not exceed 5000 characters", "VALIDATION_ERROR");
  return trimmed;
}

export function validateCommentContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) throw appError("Comment content cannot be empty", "VALIDATION_ERROR");
  if (trimmed.length > 5000) throw appError("Comment content must not exceed 5000 characters", "VALIDATION_ERROR");
  return trimmed;
}
`,

  "src/auth/password.ts": `export async function hashPassword(password: string): Promise<string> {
  if (password.length < 6) throw new Error("Password must be at least 6 characters");
  return await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}
`,

  "src/auth/jwt.ts": `import { UserRole } from "@prisma/client";

export interface TokenPayload {
  userId: string;
  role: UserRole;
  email: string;
}

const JWT_SECRET = process.env.JWT_SECRET || "default-secret-key-do-not-use-in-prod";

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString("base64").replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64").toString();
}

export function signToken(payload: TokenPayload): string {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  const completePayload = { ...payload, exp };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(completePayload));
  const data = \`\${encodedHeader}.\${encodedPayload}\`;
  const hasher = new Bun.CryptoHasher("sha256", JWT_SECRET);
  hasher.update(data);
  const signature = base64UrlEncode(hasher.digest("latin1"));
  return \`\${data}.\${signature}\`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, signature] = parts;
    if (!encodedHeader || !encodedPayload || !signature) return null;
    const data = \`\${encodedHeader}.\${encodedPayload}\`;
    const hasher = new Bun.CryptoHasher("sha256", JWT_SECRET);
    hasher.update(data);
    const expectedSignature = base64UrlEncode(hasher.digest("latin1"));
    if (signature !== expectedSignature) return null;
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as TokenPayload & { exp: number };
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: payload.userId, role: payload.role, email: payload.email };
  } catch {
    return null;
  }
}
`,

  "src/utils/business-hours.ts": `export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 18;
export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Asia/Kolkata";

export interface ZonedTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

export function getZonedTime(date: Date, timeZone: string = BUSINESS_TIMEZONE): ZonedTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hourRaw = parseInt(map.hour || "0", 10);
  return {
    year: parseInt(map.year || "1970", 10),
    month: parseInt(map.month || "1", 10),
    day: parseInt(map.day || "1", 10),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: parseInt(map.minute || "0", 10),
    dayOfWeek: weekdayMap[map.weekday || "Sun"] ?? 0,
  };
}

export function createUtcFromZoned(year: number, month: number, day: number, hour: number, minute: number, timeZone: string = BUSINESS_TIMEZONE): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let i = 0; i < 3; i++) {
    const zoned = getZonedTime(guess, timeZone);
    const diffMinutes = (hour - zoned.hour) * 60 + (minute - zoned.minute) + (day - zoned.day) * 1440;
    if (diffMinutes === 0) break;
    guess = new Date(guess.getTime() + diffMinutes * 60 * 1000);
  }
  return guess;
}

export function isHoliday(date: Date, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): boolean {
  const z = getZonedTime(date, timeZone);
  for (const h of holidays) {
    const hz = getZonedTime(h, timeZone);
    if (z.year === hz.year && z.month === hz.month && z.day === hz.day) return true;
  }
  return false;
}

export function isBusinessDay(date: Date, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): boolean {
  const z = getZonedTime(date, timeZone);
  if (z.dayOfWeek === 0 || z.dayOfWeek === 6) return false;
  return !isHoliday(date, holidays, timeZone);
}

export function snapToNextBusinessPeriod(date: Date, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): Date {
  let current = new Date(date.getTime());
  while (true) {
    const z = getZonedTime(current, timeZone);
    const isWorkingDay = isBusinessDay(current, holidays, timeZone);
    if (isWorkingDay) {
      if (z.hour < BUSINESS_START_HOUR) return createUtcFromZoned(z.year, z.month, z.day, BUSINESS_START_HOUR, 0, timeZone);
      if (z.hour < BUSINESS_END_HOUR) return current;
    }
    const nextDayUtc = new Date(current.getTime() + 24 * 3600 * 1000);
    const nz = getZonedTime(nextDayUtc, timeZone);
    current = createUtcFromZoned(nz.year, nz.month, nz.day, BUSINESS_START_HOUR, 0, timeZone);
  }
}

export function addBusinessHours(startUtc: Date, businessHours: number, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): Date {
  let remainingMinutes = Math.round(businessHours * 60);
  let current = snapToNextBusinessPeriod(startUtc, holidays, timeZone);
  while (remainingMinutes > 0) {
    const z = getZonedTime(current, timeZone);
    const minutesLeftToday = (BUSINESS_END_HOUR - z.hour) * 60 - z.minute;
    if (remainingMinutes <= minutesLeftToday) {
      const targetTotalMinutes = z.hour * 60 + z.minute + remainingMinutes;
      return createUtcFromZoned(z.year, z.month, z.day, Math.floor(targetTotalMinutes / 60), targetTotalMinutes % 60, timeZone);
    }
    remainingMinutes -= minutesLeftToday;
    const nextDay = new Date(current.getTime() + 24 * 3600 * 1000);
    const nz = getZonedTime(nextDay, timeZone);
    current = snapToNextBusinessPeriod(createUtcFromZoned(nz.year, nz.month, nz.day, BUSINESS_START_HOUR, 0, timeZone), holidays, timeZone);
  }
  return current;
}

export function getBusinessMinutesBetween(startUtc: Date, endUtc: Date, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): number {
  if (startUtc >= endUtc) return 0;
  let current = snapToNextBusinessPeriod(startUtc, holidays, timeZone);
  if (current >= endUtc) return 0;
  let totalMinutes = 0;
  while (current < endUtc) {
    const z = getZonedTime(current, timeZone);
    if (!isBusinessDay(current, holidays, timeZone)) {
      const nextDay = new Date(current.getTime() + 24 * 3600 * 1000);
      const nz = getZonedTime(nextDay, timeZone);
      current = createUtcFromZoned(nz.year, nz.month, nz.day, BUSINESS_START_HOUR, 0, timeZone);
      continue;
    }
    const dayEndUtc = createUtcFromZoned(z.year, z.month, z.day, BUSINESS_END_HOUR, 0, timeZone);
    const segmentEnd = endUtc < dayEndUtc ? endUtc : dayEndUtc;
    if (current < segmentEnd) {
      const sz = getZonedTime(segmentEnd, timeZone);
      const minutes = (sz.hour - z.hour) * 60 + (sz.minute - z.minute);
      if (minutes > 0) totalMinutes += minutes;
    }
    const nextDay = new Date(current.getTime() + 24 * 3600 * 1000);
    const nz = getZonedTime(nextDay, timeZone);
    current = createUtcFromZoned(nz.year, nz.month, nz.day, BUSINESS_START_HOUR, 0, timeZone);
  }
  return totalMinutes;
}
`,

  "src/services/sla.service.ts": `import { Priority } from "@prisma/client";
import { addBusinessHours, getBusinessMinutesBetween } from "../utils/business-hours";

export enum SLAState {
  ON_TRACK = "ON_TRACK",
  AT_RISK = "AT_RISK",
  BREACHED = "BREACHED",
}

export const SLA_POLICIES: Record<Priority, { firstResponseHours: number; resolutionHours: number }> = {
  URGENT: { firstResponseHours: 1, resolutionHours: 4 },
  HIGH: { firstResponseHours: 4, resolutionHours: 24 },
  MEDIUM: { firstResponseHours: 8, resolutionHours: 48 },
  LOW: { firstResponseHours: 24, resolutionHours: 72 },
};

export interface SLAInfo {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

export function calculateSLADeadlines(priority: Priority, createdAt: Date, holidays: Date[]) {
  const policy = SLA_POLICIES[priority];
  return {
    firstResponseDueAt: addBusinessHours(createdAt, policy.firstResponseHours, holidays),
    resolutionDueAt: addBusinessHours(createdAt, policy.resolutionHours, holidays),
  };
}

export function computeSLAInfo(
  ticket: {
    priority: Priority;
    createdAt: Date;
    firstResponseDueAt: Date;
    resolutionDueAt: Date;
    firstResponseAt: Date | null;
    resolvedAt: Date | null;
  },
  holidays: Date[],
  now: Date = new Date()
): SLAInfo {
  const policy = SLA_POLICIES[ticket.priority];
  const firstBudget = policy.firstResponseHours * 60;
  const resBudget = policy.resolutionHours * 60;

  let firstResponseState: SLAState;
  let firstResponseRemainingMinutes: number;
  if (ticket.firstResponseAt) {
    firstResponseState = ticket.firstResponseAt <= ticket.firstResponseDueAt ? SLAState.ON_TRACK : SLAState.BREACHED;
    firstResponseRemainingMinutes = 0;
  } else if (now > ticket.firstResponseDueAt) {
    firstResponseState = SLAState.BREACHED;
    firstResponseRemainingMinutes = 0;
  } else {
    const consumed = getBusinessMinutesBetween(ticket.createdAt, now, holidays);
    firstResponseState = consumed / firstBudget > 0.75 ? SLAState.AT_RISK : SLAState.ON_TRACK;
    firstResponseRemainingMinutes = getBusinessMinutesBetween(now, ticket.firstResponseDueAt, holidays);
  }

  let resolutionState: SLAState;
  let resolutionRemainingMinutes: number;
  if (ticket.resolvedAt) {
    resolutionState = ticket.resolvedAt <= ticket.resolutionDueAt ? SLAState.ON_TRACK : SLAState.BREACHED;
    resolutionRemainingMinutes = 0;
  } else if (now > ticket.resolutionDueAt) {
    resolutionState = SLAState.BREACHED;
    resolutionRemainingMinutes = 0;
  } else {
    const consumed = getBusinessMinutesBetween(ticket.createdAt, now, holidays);
    resolutionState = consumed / resBudget > 0.75 ? SLAState.AT_RISK : SLAState.ON_TRACK;
    resolutionRemainingMinutes = getBusinessMinutesBetween(now, ticket.resolutionDueAt, holidays);
  }

  return {
    firstResponseDueAt: ticket.firstResponseDueAt.toISOString(),
    resolutionDueAt: ticket.resolutionDueAt.toISOString(),
    firstResponseState,
    resolutionState,
    firstResponseRemainingMinutes,
    resolutionRemainingMinutes,
  };
}
`,

  "src/context.ts": `import { PrismaClient, UserRole } from "@prisma/client";
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
`,

  "src/graphql/schema/schema.graphql": `enum Priority { LOW MEDIUM HIGH URGENT }
enum TicketStatus { OPEN IN_PROGRESS RESOLVED CLOSED }
enum SLAState { ON_TRACK AT_RISK BREACHED }
enum UserRole { REPORTER AGENT }

type User {
  id: ID!
  name: String!
  email: String!
  role: UserRole!
  createdAt: String!
}

type SLAInfo {
  firstResponseDueAt: String!
  resolutionDueAt: String!
  firstResponseState: SLAState!
  resolutionState: SLAState!
  firstResponseRemainingMinutes: Int!
  resolutionRemainingMinutes: Int!
}

type Comment {
  id: ID!
  content: String!
  author: User!
  createdAt: String!
}

type Ticket {
  id: ID!
  title: String!
  description: String!
  priority: Priority!
  status: TicketStatus!
  reporter: User!
  assignee: User
  createdAt: String!
  firstResponseAt: String
  resolvedAt: String
  sla: SLAInfo!
  comments: [Comment!]!
}

type Holiday {
  id: ID!
  date: String!
  name: String!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}

type TicketConnection {
  nodes: [Ticket!]!
  pageInfo: PageInfo!
}

type TicketDashboard {
  openTickets: Int!
  inProgressTickets: Int!
  atRiskTickets: Int!
  breachedTickets: Int!
}

type AuthPayload {
  token: String!
  user: User!
}

type Query {
  tickets(status: TicketStatus, priority: Priority, assigneeId: ID, slaState: SLAState, take: Int, cursor: String): TicketConnection!
  ticket(id: ID!): Ticket
  dashboard: TicketDashboard!
  users(role: UserRole): [User!]!
  holidays: [Holiday!]!
}

type Mutation {
  register(name: String!, email: String!, password: String!, role: UserRole!): AuthPayload!
  login(email: String!, password: String!): AuthPayload!
  createTicket(title: String!, description: String!, priority: Priority!): Ticket!
  assignTicket(ticketId: ID!, assigneeId: ID!): Ticket!
  changeTicketStatus(ticketId: ID!, status: TicketStatus!): Ticket!
  addComment(ticketId: ID!, content: String!): Comment!
  resolveTicket(ticketId: ID!): Ticket!
}
`,

  "src/graphql/resolvers/index.ts": `import { GraphQLContext } from "../../context";
import { Priority, TicketStatus, UserRole } from "@prisma/client";
import { appError } from "../../utils/errors";
import { validateTitle, validateDescription, validateCommentContent } from "../../utils/validation";
import { hashPassword, verifyPassword } from "../../auth/password";
import { signToken } from "../../auth/jwt";
import { calculateSLADeadlines, computeSLAInfo, SLAState } from "../../services/sla.service";

const VALID_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  OPEN: [TicketStatus.IN_PROGRESS, TicketStatus.CLOSED],
  IN_PROGRESS: [TicketStatus.RESOLVED, TicketStatus.CLOSED],
  RESOLVED: [TicketStatus.CLOSED, TicketStatus.IN_PROGRESS],
  CLOSED: [],
};

export const resolvers = {
  Query: {
    dashboard: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const tickets = await ctx.prisma.ticket.findMany();
      const holidays = (await ctx.prisma.holiday.findMany()).map((h) => h.date);
      let openTickets = 0, inProgressTickets = 0, atRiskTickets = 0, breachedTickets = 0;
      for (const t of tickets) {
        if (t.status === TicketStatus.OPEN) openTickets++;
        if (t.status === TicketStatus.IN_PROGRESS) inProgressTickets++;
        const sla = computeSLAInfo(t, holidays);
        if (sla.firstResponseState === SLAState.BREACHED || sla.resolutionState === SLAState.BREACHED) breachedTickets++;
        else if (sla.firstResponseState === SLAState.AT_RISK || sla.resolutionState === SLAState.AT_RISK) atRiskTickets++;
      }
      return { openTickets, inProgressTickets, atRiskTickets, breachedTickets };
    },
    users: async (_: unknown, args: { role?: UserRole }, ctx: GraphQLContext) => {
      return ctx.prisma.user.findMany({ where: args.role ? { role: args.role } : {}, orderBy: { name: "asc" } });
    },
    holidays: async (_: unknown, __: unknown, ctx: GraphQLContext) => {
      const list = await ctx.prisma.holiday.findMany({ orderBy: { date: "asc" } });
      return list.map((h) => ({ id: h.id, name: h.name, date: h.date.toISOString().split("T")[0] || "" }));
    },
    ticket: async (_: unknown, args: { id: string }, ctx: GraphQLContext) => {
      const t = await ctx.prisma.ticket.findUnique({
        where: { id: args.id },
        include: { reporter: true, assignee: true, comments: { include: { author: true }, orderBy: { createdAt: "asc" } } },
      });
      if (!t) throw appError(\`Ticket with ID \${args.id} not found\`, "TICKET_NOT_FOUND");
      return t;
    },
    tickets: async (
      _: unknown,
      args: { status?: TicketStatus; priority?: Priority; assigneeId?: string; slaState?: SLAState; take?: number; cursor?: string },
      ctx: GraphQLContext
    ) => {
      const takeLimit = Math.min(args.take || 20, 50);
      const holidays = (await ctx.prisma.holiday.findMany()).map((h) => h.date);
      const where: { status?: TicketStatus; priority?: Priority; assigneeId?: string } = {};
      if (args.status) where.status = args.status;
      if (args.priority) where.priority = args.priority;
      if (args.assigneeId) where.assigneeId = args.assigneeId;
      const tickets = await ctx.prisma.ticket.findMany({
        where,
        include: { reporter: true, assignee: true, comments: { include: { author: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      let filtered = tickets;
      if (args.slaState) {
        filtered = tickets.filter((t) => {
          const sla = computeSLAInfo(t, holidays);
          return sla.firstResponseState === args.slaState || sla.resolutionState === args.slaState;
        });
      }
      let startIndex = 0;
      if (args.cursor) {
        const foundIdx = filtered.findIndex((t) => t.id === args.cursor);
        if (foundIdx !== -1) startIndex = foundIdx + 1;
      }
      const paginatedNodes = filtered.slice(startIndex, startIndex + takeLimit);
      return {
        nodes: paginatedNodes,
        pageInfo: {
          hasNextPage: startIndex + takeLimit < filtered.length,
          endCursor: paginatedNodes.length > 0 ? paginatedNodes[paginatedNodes.length - 1]?.id || null : null,
        },
      };
    },
  },
  Mutation: {
    register: async (_: unknown, args: { name: string; email: string; password: string; role: UserRole }, ctx: GraphQLContext) => {
      const email = args.email.trim().toLowerCase();
      const existing = await ctx.prisma.user.findUnique({ where: { email } });
      if (existing) throw appError("A user with this email already exists", "DUPLICATE_EMAIL");
      const passwordHash = await hashPassword(args.password);
      const user = await ctx.prisma.user.create({ data: { name: args.name.trim(), email, passwordHash, role: args.role } });
      return { token: signToken({ userId: user.id, role: user.role, email: user.email }), user };
    },
    login: async (_: unknown, args: { email: string; password: string }, ctx: GraphQLContext) => {
      const email = args.email.trim().toLowerCase();
      const user = await ctx.prisma.user.findUnique({ where: { email } });
      if (!user) throw appError("Invalid email or password", "UNAUTHENTICATED");
      const valid = await verifyPassword(args.password, user.passwordHash);
      if (!valid) throw appError("Invalid email or password", "UNAUTHENTICATED");
      return { token: signToken({ userId: user.id, role: user.role, email: user.email }), user };
    },
    createTicket: async (_: unknown, args: { title: string; description: string; priority: Priority }, ctx: GraphQLContext) => {
      if (!ctx.user) throw appError("Authentication required to create a ticket", "UNAUTHENTICATED");
      const title = validateTitle(args.title);
      const description = validateDescription(args.description);
      const holidays = (await ctx.prisma.holiday.findMany()).map((h) => h.date);
      const deadlines = calculateSLADeadlines(args.priority, new Date(), holidays);
      return ctx.prisma.ticket.create({
        data: {
          title, description, priority: args.priority, reporterId: ctx.user.userId,
          firstResponseDueAt: deadlines.firstResponseDueAt, resolutionDueAt: deadlines.resolutionDueAt,
        },
        include: { reporter: true, assignee: true, comments: true },
      });
    },
    assignTicket: async (_: unknown, args: { ticketId: string; assigneeId: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw appError("Authentication required", "UNAUTHENTICATED");
      if (ctx.user.role !== UserRole.AGENT) throw appError("Only agents can assign tickets", "FORBIDDEN");
      const ticket = await ctx.prisma.ticket.findUnique({ where: { id: args.ticketId } });
      if (!ticket) throw appError("Ticket not found", "TICKET_NOT_FOUND");
      const assignee = await ctx.prisma.user.findUnique({ where: { id: args.assigneeId } });
      if (!assignee) throw appError("Assignee user not found", "USER_NOT_FOUND");
      if (assignee.role !== UserRole.AGENT) throw appError("Tickets can only be assigned to AGENT users", "VALIDATION_ERROR");
      return ctx.prisma.ticket.update({
        where: { id: args.ticketId }, data: { assigneeId: assignee.id },
        include: { reporter: true, assignee: true, comments: { include: { author: true } } },
      });
    },
    changeTicketStatus: async (_: unknown, args: { ticketId: string; status: TicketStatus }, ctx: GraphQLContext) => {
      if (!ctx.user) throw appError("Authentication required", "UNAUTHENTICATED");
      if (ctx.user.role !== UserRole.AGENT) throw appError("Only agents can modify ticket status", "FORBIDDEN");
      const ticket = await ctx.prisma.ticket.findUnique({ where: { id: args.ticketId } });
      if (!ticket) throw appError("Ticket not found", "TICKET_NOT_FOUND");
      if (!(VALID_TRANSITIONS[ticket.status] || []).includes(args.status)) {
        throw appError(\`Ticket cannot transition from \${ticket.status} to \${args.status}.\`, "INVALID_STATUS_TRANSITION");
      }
      return ctx.prisma.ticket.update({
        where: { id: args.ticketId }, data: { status: args.status },
        include: { reporter: true, assignee: true, comments: { include: { author: true } } },
      });
    },
    resolveTicket: async (_: unknown, args: { ticketId: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw appError("Authentication required", "UNAUTHENTICATED");
      if (ctx.user.role !== UserRole.AGENT) throw appError("Only agents can resolve tickets", "FORBIDDEN");
      const ticket = await ctx.prisma.ticket.findUnique({ where: { id: args.ticketId } });
      if (!ticket) throw appError("Ticket not found", "TICKET_NOT_FOUND");
      if (ticket.status === TicketStatus.CLOSED) throw appError("Cannot resolve a CLOSED ticket", "INVALID_STATUS_TRANSITION");
      return ctx.prisma.ticket.update({
        where: { id: args.ticketId },
        data: { status: TicketStatus.RESOLVED, resolvedAt: ticket.resolvedAt ?? new Date() },
        include: { reporter: true, assignee: true, comments: { include: { author: true } } },
      });
    },
    addComment: async (_: unknown, args: { ticketId: string; content: string }, ctx: GraphQLContext) => {
      if (!ctx.user) throw appError("Authentication required", "UNAUTHENTICATED");
      const content = validateCommentContent(args.content);
      const ticket = await ctx.prisma.ticket.findUnique({ where: { id: args.ticketId } });
      if (!ticket) throw appError("Ticket not found", "TICKET_NOT_FOUND");
      const comment = await ctx.prisma.comment.create({
        data: { ticketId: args.ticketId, authorId: ctx.user.userId, content },
        include: { author: true },
      });
      if (!ticket.firstResponseAt && ctx.user.userId !== ticket.reporterId) {
        await ctx.prisma.ticket.update({ where: { id: ticket.id }, data: { firstResponseAt: new Date() } });
      }
      return comment;
    },
  },
  Ticket: {
    createdAt: (parent: { createdAt: Date | string }) => new Date(parent.createdAt).toISOString(),
    firstResponseAt: (parent: { firstResponseAt?: Date | string | null }) => parent.firstResponseAt ? new Date(parent.firstResponseAt).toISOString() : null,
    resolvedAt: (parent: { resolvedAt?: Date | string | null }) => parent.resolvedAt ? new Date(parent.resolvedAt).toISOString() : null,
    sla: async (parent: {
      priority: Priority; createdAt: Date | string; firstResponseDueAt: Date | string; resolutionDueAt: Date | string;
      firstResponseAt?: Date | string | null; resolvedAt?: Date | string | null;
    }, _: unknown, ctx: GraphQLContext) => {
      const holidays = (await ctx.prisma.holiday.findMany()).map((h) => h.date);
      return computeSLAInfo({
        priority: parent.priority,
        createdAt: new Date(parent.createdAt),
        firstResponseDueAt: new Date(parent.firstResponseDueAt),
        resolutionDueAt: new Date(parent.resolutionDueAt),
        firstResponseAt: parent.firstResponseAt ? new Date(parent.firstResponseAt) : null,
        resolvedAt: parent.resolvedAt ? new Date(parent.resolvedAt) : null,
      }, holidays);
    },
  },
  User: {
    createdAt: (parent: { createdAt: Date | string }) => new Date(parent.createdAt).toISOString(),
  },
  Comment: {
    createdAt: (parent: { createdAt: Date | string }) => new Date(parent.createdAt).toISOString(),
  },
};
`,

  "src/server.ts": `import { createYoga, createSchema } from "graphql-yoga";
import { createContext } from "./context";
import { resolvers } from "./graphql/resolvers";
import fs from "node:fs";
import path from "node:path";

const typeDefs = fs.readFileSync(path.join(import.meta.dir, "graphql/schema/schema.graphql"), "utf8");
const schema = createSchema({ typeDefs, resolvers });
const yoga = createYoga({
  schema,
  context: ({ request }) => createContext(request),
  cors: { origin: "*", credentials: true, methods: ["POST", "GET", "OPTIONS"] },
});
const server = Bun.serve({ port: 4000, fetch: yoga.fetch });
console.log(\`🚀 GraphQL Yoga Server ready at http://localhost:\${server.port}/graphql\`);
`,

  "prisma/seed.ts": `import { PrismaClient, UserRole, Priority, TicketStatus } from "@prisma/client";
import { calculateSLADeadlines } from "../src/services/sla.service";
import { hashPassword } from "../src/auth/password";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");
  await prisma.comment.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.holiday.deleteMany({});

  await prisma.holiday.createMany({
    data: [
      { date: new Date("2026-01-26T00:00:00.000Z"), name: "Republic Day" },
      { date: new Date("2026-08-15T00:00:00.000Z"), name: "Independence Day" },
      { date: new Date("2026-10-02T00:00:00.000Z"), name: "Gandhi Jayanti" },
    ],
  });

  const allHolidays = (await prisma.holiday.findMany()).map((h) => h.date);
  const reporterPassword = await hashPassword("password123");
  const agentPassword = await hashPassword("password123");

  const reporter = await prisma.user.create({
    data: { name: "Rahul Sharma (Reporter)", email: "reporter@example.com", passwordHash: reporterPassword, role: UserRole.REPORTER },
  });
  const agent = await prisma.user.create({
    data: { name: "Priya Patel (Support Agent)", email: "agent@example.com", passwordHash: agentPassword, role: UserRole.AGENT },
  });

  console.log("✅ Users: reporter@example.com / password123 | agent@example.com / password123");

  const now = new Date();
  const urgent = calculateSLADeadlines(Priority.URGENT, now, allHolidays);
  await prisma.ticket.create({
    data: {
      title: "Production database down - Payment failure",
      description: "Users are unable to complete checkout. 500 error on gateway callback.",
      priority: Priority.URGENT, status: TicketStatus.OPEN, reporterId: reporter.id,
      firstResponseDueAt: urgent.firstResponseDueAt, resolutionDueAt: urgent.resolutionDueAt,
    },
  });

  const high = calculateSLADeadlines(Priority.HIGH, now, allHolidays);
  const highTicket = await prisma.ticket.create({
    data: {
      title: "Authentication token expiry bug",
      description: "JWT refresh loop causes high CPU usage on client devices.",
      priority: Priority.HIGH, status: TicketStatus.IN_PROGRESS, reporterId: reporter.id, assigneeId: agent.id,
      firstResponseDueAt: high.firstResponseDueAt, resolutionDueAt: high.resolutionDueAt,
      firstResponseAt: new Date(Date.now() - 30 * 60 * 1000),
    },
  });

  await prisma.comment.create({ data: { ticketId: highTicket.id, authorId: reporter.id, content: "Here are the frontend console logs." } });
  await prisma.comment.create({ data: { ticketId: highTicket.id, authorId: agent.id, content: "Investigating token refresh interval." } });

  const medium = calculateSLADeadlines(Priority.MEDIUM, now, allHolidays);
  await prisma.ticket.create({
    data: {
      title: "Update user invoice PDF format",
      description: "Add GSTIN and billing address fields to invoices.",
      priority: Priority.MEDIUM, status: TicketStatus.RESOLVED, reporterId: reporter.id, assigneeId: agent.id,
      firstResponseDueAt: medium.firstResponseDueAt, resolutionDueAt: medium.resolutionDueAt,
      firstResponseAt: new Date(Date.now() - 2 * 3600 * 1000),
      resolvedAt: new Date(Date.now() - 1 * 3600 * 1000),
    },
  });

  console.log("✅ Seed complete!");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
`,

  "tests/unit/business-hours.test.ts": `import { expect, test, describe } from "bun:test";
import { addBusinessHours, createUtcFromZoned } from "../../src/utils/business-hours";

describe("Business Hours Engine", () => {
  test("Adds 1 business hour on weekday morning", () => {
    const monday10am = createUtcFromZoned(2026, 8, 17, 10, 0);
    const due = addBusinessHours(monday10am, 1, []);
    expect(due.toISOString()).toBe(createUtcFromZoned(2026, 8, 17, 11, 0).toISOString());
  });

  test("Handles end of day rollover", () => {
    const monday4pm = createUtcFromZoned(2026, 8, 17, 16, 0);
    const due = addBusinessHours(monday4pm, 4, []);
    expect(due.toISOString()).toBe(createUtcFromZoned(2026, 8, 18, 11, 0).toISOString());
  });

  test("Handles before business hours", () => {
    const monday7am = createUtcFromZoned(2026, 8, 17, 7, 0);
    const due = addBusinessHours(monday7am, 2, []);
    expect(due.toISOString()).toBe(createUtcFromZoned(2026, 8, 17, 11, 0).toISOString());
  });

  test("Handles Friday evening crossing weekend", () => {
    const friday5pm = createUtcFromZoned(2026, 8, 21, 17, 0);
    const due = addBusinessHours(friday5pm, 4, []);
    expect(due.toISOString()).toBe(createUtcFromZoned(2026, 8, 24, 12, 0).toISOString());
  });

  test("Skips public holidays", () => {
    const holidayMon = [createUtcFromZoned(2026, 8, 17, 0, 0)];
    const friday5pm = createUtcFromZoned(2026, 8, 14, 17, 0);
    const due = addBusinessHours(friday5pm, 4, holidayMon);
    expect(due.toISOString()).toBe(createUtcFromZoned(2026, 8, 18, 12, 0).toISOString());
  });
});
`,

  "tests/unit/sla.test.ts": `import { expect, test, describe } from "bun:test";
import { computeSLAInfo, SLAState } from "../../src/services/sla.service";
import { Priority } from "@prisma/client";
import { createUtcFromZoned } from "../../src/utils/business-hours";

describe("SLA Calculation", () => {
  test("ON_TRACK when under 75%", () => {
    const created = createUtcFromZoned(2026, 8, 17, 10, 0);
    const due = createUtcFromZoned(2026, 8, 17, 14, 0);
    const now = createUtcFromZoned(2026, 8, 17, 11, 0);
    const sla = computeSLAInfo({
      priority: Priority.HIGH, createdAt: created, firstResponseDueAt: due, resolutionDueAt: due,
      firstResponseAt: null, resolvedAt: null,
    }, [], now);
    expect(sla.firstResponseState).toBe(SLAState.ON_TRACK);
  });

  test("AT_RISK when over 75%", () => {
    const created = createUtcFromZoned(2026, 8, 17, 10, 0);
    const due = createUtcFromZoned(2026, 8, 17, 14, 0);
    const now = createUtcFromZoned(2026, 8, 17, 13, 10);
    const sla = computeSLAInfo({
      priority: Priority.HIGH, createdAt: created, firstResponseDueAt: due, resolutionDueAt: due,
      firstResponseAt: null, resolvedAt: null,
    }, [], now);
    expect(sla.firstResponseState).toBe(SLAState.AT_RISK);
  });

  test("Freezes completed first response SLA", () => {
    const created = createUtcFromZoned(2026, 8, 17, 10, 0);
    const due = createUtcFromZoned(2026, 8, 17, 14, 0);
    const responded = createUtcFromZoned(2026, 8, 17, 11, 0);
    const later = createUtcFromZoned(2026, 8, 20, 10, 0);
    const sla = computeSLAInfo({
      priority: Priority.HIGH, createdAt: created, firstResponseDueAt: due, resolutionDueAt: due,
      firstResponseAt: responded, resolvedAt: null,
    }, [], later);
    expect(sla.firstResponseState).toBe(SLAState.ON_TRACK);
    expect(sla.firstResponseRemainingMinutes).toBe(0);
  });
});
`,

  "tests/integration/ticket-lifecycle.test.ts": `import { expect, test, describe } from "bun:test";
import { PrismaClient, Priority, UserRole, TicketStatus } from "@prisma/client";
import { calculateSLADeadlines } from "../../src/services/sla.service";

const prisma = new PrismaClient();

describe("Integration: PostgreSQL Ticket Lifecycle", () => {
  test("Creates ticket, first response, resolve on real DB", async () => {
    const reporter = await prisma.user.create({
      data: { name: "Test Reporter", email: \`reporter_\${Date.now()}@test.com\`, passwordHash: "hash", role: UserRole.REPORTER },
    });
    const agent = await prisma.user.create({
      data: { name: "Test Agent", email: \`agent_\${Date.now()}@test.com\`, passwordHash: "hash", role: UserRole.AGENT },
    });
    const deadlines = calculateSLADeadlines(Priority.URGENT, new Date(), []);
    const ticket = await prisma.ticket.create({
      data: {
        title: "Database connection leak", description: "Pool exhausted",
        priority: Priority.URGENT, reporterId: reporter.id,
        firstResponseDueAt: deadlines.firstResponseDueAt, resolutionDueAt: deadlines.resolutionDueAt,
      },
    });
    expect(ticket.status).toBe(TicketStatus.OPEN);
    expect(ticket.firstResponseAt).toBeNull();

    await prisma.comment.create({ data: { ticketId: ticket.id, authorId: agent.id, content: "Investigating now." } });
    const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { firstResponseAt: new Date() } });
    expect(updated.firstResponseAt).not.toBeNull();

    const resolved = await prisma.ticket.update({
      where: { id: ticket.id }, data: { status: TicketStatus.RESOLVED, resolvedAt: new Date() },
    });
    expect(resolved.status).toBe(TicketStatus.RESOLVED);
    expect(resolved.resolvedAt).not.toBeNull();
  });
});
`,

  "README.md": `# Support Ticket & SLA Tracker

Bun + TypeScript + GraphQL Yoga + PostgreSQL + Prisma + React

## Quick Start

\`\`\`bash
docker compose up -d
bun install
bun run db:generate
bun run db:migrate
bun run db:seed
bun run dev
\`\`\`

Frontend:
\`\`\`bash
cd frontend
bun install
bun run dev
\`\`\`

## Seed Logins
- agent@example.com / password123
- reporter@example.com / password123

## Tests
\`\`\`bash
bun test
\`\`\`
`,
};

console.log("⚡ Generating project files...");
for (const [relativePath, content] of Object.entries(files)) {
  const fullPath = path.join(process.cwd(), relativePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
  console.log(" ✅", relativePath);
}
console.log("\\n🎉 ALL PROJECT FILES CREATED SUCCESSFULLY!");