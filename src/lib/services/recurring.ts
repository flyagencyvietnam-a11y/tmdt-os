import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import {
  checklistItems,
  recurringRules,
  sbus,
  tasks,
  type RecurringRule,
  type Task,
} from "@/lib/db/schema";
import { nextTaskCode } from "./codes";
import { addDaysStr, todayVnDayStr } from "@/lib/time";
import {
  applyHolidayPolicy,
  firstWorkingDayOfMonth,
  lastWorkingDayOfMonth,
  loadDeptWorkDays,
  loadHolidaySet,
} from "./workdays";

/** SPEC Mục 6.2 — khuôn mẫu task sinh từ rule. */
export interface TaskTemplate {
  title: string;
  description?: string;
  type?: Task["type"];
  priority?: Task["priority"];
  channel?: string;
  campaignId?: string | null;
  labels?: string[];
  checklist?: string[];
  estimateHours?: string;
  timeSlot?: Task["timeSlot"];
}

const MONTH_NAMES = [
  "Một",
  "Hai",
  "Ba",
  "Tư",
  "Năm",
  "Sáu",
  "Bảy",
  "Tám",
  "Chín",
  "Mười",
  "Mười Một",
  "Mười Hai",
];

/** SPEC Mục 6.2 — biến trong title/description. */
export function renderTemplate(
  str: string,
  vars: {
    occurrenceDate: string;
    dueDate: string;
    sbuCode?: string;
    sbuName?: string;
    ownerName?: string;
  },
): string {
  const [y, m] = vars.occurrenceDate.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  const next = new Date(Date.UTC(y, m, 1));
  const weekNumber = Math.ceil(Number(vars.occurrenceDate.slice(8, 10)) / 7);
  return str
    .replaceAll("{{month}}", String(m))
    .replaceAll("{{month_name}}", MONTH_NAMES[m - 1] ?? String(m))
    .replaceAll("{{year}}", String(y))
    .replaceAll("{{prev_month}}", String(prev.getUTCMonth() + 1))
    .replaceAll("{{next_month}}", String(next.getUTCMonth() + 1))
    .replaceAll("{{week_number}}", String(weekNumber))
    .replaceAll("{{due_date}}", formatDmy(vars.dueDate))
    .replaceAll("{{sbu_code}}", vars.sbuCode ?? "")
    .replaceAll("{{sbu_name}}", vars.sbuName ?? "")
    .replaceAll("{{owner_name}}", vars.ownerName ?? "");
}

function formatDmy(dayStr: string): string {
  const [y, m, d] = dayStr.split("-");
  return `${d}/${m}/${y}`;
}

function monthsBetween(fromDay: string, toDay: string): string[] {
  const out: string[] = [];
  let [y, m] = fromDay.split("-").map(Number);
  const [ty, tm] = toDay.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

function monthIndex(dayStr: string): number {
  const [y, m] = dayStr.split("-").map(Number);
  return y * 12 + (m - 1);
}

function nthWeekdayOfMonth(monthAnyDay: string, weekday: number, nth: number): string {
  const [y, m] = monthAnyDay.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const matches: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    const day = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
    if ((wd === 0 ? 7 : wd) === weekday) matches.push(day);
  }
  return nth > 0 ? matches[nth - 1] : matches[matches.length + nth];
}

/** Ngày danh nghĩa (đã áp day_rule + holiday_policy) trong [fromDay, toDay] — SPEC Mục 6.3. */
export function computeNominalDates(
  rule: Pick<
    RecurringRule,
    | "freq"
    | "interval"
    | "byWeekday"
    | "byMonthDay"
    | "byNthWeekday"
    | "dayRule"
    | "holidayPolicy"
    | "startsOn"
    | "endsOn"
    | "skippedDates"
  >,
  fromDay: string,
  toDay: string,
  workDays: number[],
  holidaySet: Set<string>,
): string[] {
  const skip = new Set(rule.skippedDates ?? []);
  const lo = rule.startsOn > fromDay ? rule.startsOn : fromDay;
  const hi = rule.endsOn && rule.endsOn < toDay ? rule.endsOn : toDay;
  if (lo > hi) return [];

  const out: string[] = [];

  if (rule.freq === "monthly") {
    const startMonthIdx = monthIndex(rule.startsOn);
    for (const monthAnchor of monthsBetween(lo, hi)) {
      const mi = monthIndex(monthAnchor);
      if ((mi - startMonthIdx) % rule.interval !== 0) continue;
      let day: string;
      if (rule.dayRule === "last_working_day") {
        day = lastWorkingDayOfMonth(monthAnchor, workDays, holidaySet);
      } else if (rule.dayRule === "first_working_day") {
        day = firstWorkingDayOfMonth(monthAnchor, workDays, holidaySet);
      } else if (rule.byNthWeekday) {
        const spec = rule.byNthWeekday as { weekday: number; nth: number };
        day = nthWeekdayOfMonth(monthAnchor, spec.weekday, spec.nth);
        day = applyHolidayPolicy(day, rule.holidayPolicy, workDays, holidaySet);
      } else {
        const [y, m] = monthAnchor.split("-").map(Number);
        const lastDayNum = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const raw = rule.byMonthDay === -1 || !rule.byMonthDay
          ? lastDayNum
          : Math.min(rule.byMonthDay, lastDayNum);
        day = `${y}-${String(m).padStart(2, "0")}-${String(raw).padStart(2, "0")}`;
        day = applyHolidayPolicy(day, rule.holidayPolicy, workDays, holidaySet);
      }
      if (day >= lo && day <= hi && !skip.has(day)) out.push(day);
    }
  } else if (rule.freq === "weekly") {
    const weekdays = rule.byWeekday?.length ? rule.byWeekday : [1];
    let d = lo;
    let guard = 0;
    const startWeekIdx = Math.floor(
      (new Date(`${rule.startsOn}T00:00:00Z`).getTime()) / (7 * 86400000),
    );
    while (d <= hi && guard < 3660) {
      const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
      const iso = wd === 0 ? 7 : wd;
      const weekIdx = Math.floor(new Date(`${d}T00:00:00Z`).getTime() / (7 * 86400000));
      if (weekdays.includes(iso) && (weekIdx - startWeekIdx) % rule.interval === 0) {
        const day = applyHolidayPolicy(d, rule.holidayPolicy, workDays, holidaySet);
        if (day >= lo && day <= hi && !skip.has(day)) out.push(day);
      }
      d = addDaysStr(d, 1);
      guard++;
    }
  } else if (rule.freq === "daily") {
    let d = lo;
    let guard = 0;
    while (d <= hi && guard < 3660) {
      const diffDays = Math.round(
        (new Date(`${d}T00:00:00Z`).getTime() - new Date(`${rule.startsOn}T00:00:00Z`).getTime()) /
          86400000,
      );
      if (diffDays >= 0 && diffDays % rule.interval === 0) {
        const day = applyHolidayPolicy(d, rule.holidayPolicy, workDays, holidaySet);
        if (day >= lo && day <= hi && !skip.has(day)) out.push(day);
      }
      d = addDaysStr(d, 1);
      guard++;
    }
  } else if (rule.freq === "yearly") {
    const [, sm, sd] = rule.startsOn.split("-");
    const startYear = Number(rule.startsOn.slice(0, 4));
    for (let y = Number(lo.slice(0, 4)); y <= Number(hi.slice(0, 4)); y++) {
      if ((y - startYear) % rule.interval !== 0) continue;
      let day = `${y}-${sm}-${sd}`;
      day = applyHolidayPolicy(day, rule.holidayPolicy, workDays, holidaySet);
      if (day >= lo && day <= hi && !skip.has(day)) out.push(day);
    }
  }

  return out;
}

export interface GenerateResult {
  created: number;
  skippedExisting: number;
}

/** SPEC Mục 6.3/6.5 — sinh task còn thiếu cho 1 rule, idempotent qua unique index DB. */
export async function generateTasksForRule(
  db: DB,
  rule: RecurringRule,
  now: Date = new Date(),
): Promise<GenerateResult> {
  if (!rule.active) return { created: 0, skippedExisting: 0 };
  if (rule.pausedUntil && rule.pausedUntil > todayVnDayStr(now)) return { created: 0, skippedExisting: 0 };

  const holidaySet = await loadHolidaySet(db);
  const workDays = await loadDeptWorkDays(db);
  const today = todayVnDayStr(now);
  const horizonEnd = addDaysStr(today, rule.generationHorizonDays);
  const dates = computeNominalDates(rule, today, horizonEnd, workDays, holidaySet);

  const template = rule.taskTemplate as TaskTemplate;
  let created = 0;
  let skippedExisting = 0;

  for (const occurrenceDate of dates) {
    const dueDate = addDaysStr(occurrenceDate, rule.dueOffsetDays);

    if (rule.scopeMode === "per_sbu") {
      const allActiveSbus = await db.select().from(sbus).where(eq(sbus.active, true));
      const scopedSbus = rule.scopeSbuIds?.length
        ? targetSbusAll(allActiveSbus, rule.scopeSbuIds)
        : allActiveSbus;

      if (rule.fanOutMode === "task_per_sbu") {
        for (const sbu of scopedSbus) {
          const assigneeId =
            rule.assignmentMode === "sbu_ho_owner" ? sbu.hoOwnerId : rule.fixedAssigneeId;
          const r = await insertOccurrence(db, rule, occurrenceDate, dueDate, sbu.id, assigneeId ?? null, {
            ...template,
            title: renderTemplate(template.title, { occurrenceDate, dueDate, sbuCode: sbu.code, sbuName: sbu.name }),
            description: template.description
              ? renderTemplate(template.description, { occurrenceDate, dueDate, sbuCode: sbu.code, sbuName: sbu.name })
              : undefined,
          });
          if (r) created++;
          else skippedExisting++;
        }
      } else {
        // checklist_per_owner — nhóm theo ho_owner_id (Mục 6.5).
        const byOwner = new Map<string, typeof scopedSbus>();
        for (const sbu of scopedSbus) {
          const owner = sbu.hoOwnerId ?? "unassigned";
          if (!byOwner.has(owner)) byOwner.set(owner, []);
          byOwner.get(owner)!.push(sbu);
        }
        for (const [ownerId, ownerSbus] of byOwner) {
          const assigneeId = ownerId === "unassigned" ? null : ownerId;
          const r = await insertOccurrence(
            db,
            rule,
            occurrenceDate,
            dueDate,
            assigneeId ?? "unassigned",
            assigneeId,
            {
              ...template,
              title: renderTemplate(template.title, { occurrenceDate, dueDate }),
              description: template.description
                ? renderTemplate(template.description, { occurrenceDate, dueDate })
                : undefined,
            },
            ownerSbus.map((s) => ({ sbuId: s.id, text: s.name })),
          );
          if (r) created++;
          else skippedExisting++;
        }
      }
    } else {
      const assigneeId = rule.assignmentMode === "fixed_user" ? rule.fixedAssigneeId : null;
      const r = await insertOccurrence(db, rule, occurrenceDate, dueDate, null, assigneeId ?? null, {
        ...template,
        title: renderTemplate(template.title, { occurrenceDate, dueDate }),
        description: template.description
          ? renderTemplate(template.description, { occurrenceDate, dueDate })
          : undefined,
      });
      if (r) created++;
      else skippedExisting++;
    }
  }

  return { created, skippedExisting };
}

function targetSbusAll<T extends { id: string }>(all: T[], ids: string[]): T[] {
  const set = new Set(ids);
  return all.filter((s) => set.has(s.id));
}

async function insertOccurrence(
  db: DB,
  rule: RecurringRule,
  occurrenceDate: string,
  dueDate: string,
  scopeKey: string | null,
  assigneeId: string | null,
  template: TaskTemplate,
  checklistSeed?: { sbuId: string; text: string }[],
): Promise<boolean> {
  const code = await nextTaskCode(db);
  const [inserted] = await db
    .insert(tasks)
    .values({
      code,
      title: template.title,
      description: template.description ?? null,
      type: template.type ?? "general",
      priority: template.priority ?? "medium",
      channel: template.channel ?? null,
      estimateHours: template.estimateHours ?? null,
      timeSlot: template.timeSlot ?? null,
      campaignId: template.campaignId ?? rule.campaignId ?? null,
      assigneeId,
      dueDate,
      dueTime: rule.dueTime,
      sourceType: "recurring",
      sourceId: rule.id,
      recurringRuleId: rule.id,
      occurrenceDate,
      scopeKey,
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) return false;

  if (checklistSeed?.length) {
    await db.insert(checklistItems).values(
      checklistSeed.map((c, i) => ({
        taskId: inserted.id,
        text: c.text,
        sbuId: c.sbuId,
        sortOrder: String(i),
      })),
    );
  } else if (template.checklist?.length) {
    await db.insert(checklistItems).values(
      template.checklist.map((text, i) => ({ taskId: inserted.id, text, sortOrder: String(i) })),
    );
  }
  return true;
}

/** Chạy toàn bộ rule active — gọi mỗi đêm 00:30 (SPEC Mục 6.3). */
export async function generateAllRecurringTasks(db: DB, now: Date = new Date()) {
  const rules = await db.select().from(recurringRules).where(eq(recurringRules.active, true));
  let created = 0;
  for (const rule of rules) {
    const r = await generateTasksForRule(db, rule, now);
    created += r.created;
  }
  return { created, ruleCount: rules.length };
}
