import { PrismaClient, UserRole, Priority, TicketStatus } from "@prisma/client";
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
    data: { name: "Naved (Support Agent)", email: "agent@example.com", passwordHash: agentPassword, role: UserRole.AGENT },
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