import { GraphQLContext } from "../../context";
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
      if (!t) throw appError(`Ticket with ID ${args.id} not found`, "TICKET_NOT_FOUND");
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
        throw appError(`Ticket cannot transition from ${ticket.status} to ${args.status}.`, "INVALID_STATUS_TRANSITION");
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
