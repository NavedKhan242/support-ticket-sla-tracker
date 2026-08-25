import { expect, test, describe } from "bun:test";
import { PrismaClient, Priority, UserRole, TicketStatus } from "@prisma/client";
import { calculateSLADeadlines } from "../../src/services/sla.service";

const prisma = new PrismaClient();

describe("Integration: PostgreSQL Ticket Lifecycle", () => {
  test("Creates ticket, first response, resolve on real DB", async () => {
    const reporter = await prisma.user.create({
      data: { name: "Test Reporter", email: `reporter_${Date.now()}@test.com`, passwordHash: "hash", role: UserRole.REPORTER },
    });
    const agent = await prisma.user.create({
      data: { name: "Test Agent", email: `agent_${Date.now()}@test.com`, passwordHash: "hash", role: UserRole.AGENT },
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
