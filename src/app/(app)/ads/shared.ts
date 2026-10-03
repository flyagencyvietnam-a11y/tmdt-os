export type Line = "b2c_system" | "b2c_center" | "ecom" | "b2b" | "osir" | "vmp";
export type PeriodType = "month" | "week";

export interface MetricRow {
  id: string;
  line: Line;
  periodType: PeriodType;
  period: string;
  sbuId: string | null;
  budget: string | null;
  centerOrderBudget: string | null;
  hoTopupBudget: string | null;
  leads: string | null;
  newStudents: string | null;
  messages: string | null;
  impressions: string | null;
  revenue: string | null;
  actualRevenue: string | null;
  mql: string | null;
  deals: string | null;
  status: string;
  centerFeedback?: string | null;
  mktAssessment?: string | null;
  notes?: string | null;
}

export interface SbuLite {
  id: string;
  code: string;
  name: string;
}

export interface CampaignRow {
  id: string;
  sbuId: string;
  period: string;
  campaignName: string;
  spend: string;
  misaRequestUrl?: string | null;
  messages?: string | null;
  reach?: string | null;
  impressions?: string | null;
  conversations?: string | null;
  comments?: string | null;
  engagements?: string | null;
  reactions?: string | null;
  spendWithVat?: string | null;
  [k: string]: unknown;
}

export interface DisbursementRow {
  id: string;
  line: string;
  period: string;
  plannedAmount: string;
  notes: string | null;
}

export const LINE_LABELS: Record<Line, string> = {
  b2c_system: "B2C Hệ thống",
  b2c_center: "B2C Trung tâm",
  ecom: "Ecom (TMĐT)",
  b2b: "B2B",
  osir: "OSIR",
  vmp: "VMP (Du học)",
};
