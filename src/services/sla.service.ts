import { Priority } from "@prisma/client";
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
