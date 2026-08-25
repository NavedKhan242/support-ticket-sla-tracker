import { expect, test, describe } from "bun:test";
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
