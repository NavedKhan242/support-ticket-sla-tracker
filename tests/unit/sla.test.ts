import { expect, test, describe } from "bun:test";
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
