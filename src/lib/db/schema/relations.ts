import { relations } from "drizzle-orm";
import { campaignDailyMetrics, campaigns } from "./campaigns";
import { enrollments } from "./enrollments";
import { kpiAssignments, kpiDefinitions } from "./kpi";
import { leadInteractions, leadStageHistory, leads } from "./leads";
import { products } from "./products";
import { tasks } from "./tasks";
import { users } from "./users";

export const usersRelations = relations(users, ({ many }) => ({
  assignedLeads: many(leads, { relationName: "lead_assigned_to" }),
  ownedCampaigns: many(campaigns),
  tasks: many(tasks),
  kpiAssignments: many(kpiAssignments),
}));

export const productsRelations = relations(products, ({ many }) => ({
  campaigns: many(campaigns),
  leads: many(leads),
  enrollments: many(enrollments),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  product: one(products, {
    fields: [campaigns.productId],
    references: [products.id],
  }),
  owner: one(users, { fields: [campaigns.ownerId], references: [users.id] }),
  dailyMetrics: many(campaignDailyMetrics),
  leads: many(leads),
}));

export const campaignDailyMetricsRelations = relations(
  campaignDailyMetrics,
  ({ one }) => ({
    campaign: one(campaigns, {
      fields: [campaignDailyMetrics.campaignId],
      references: [campaigns.id],
    }),
  }),
);

export const leadsRelations = relations(leads, ({ one, many }) => ({
  product: one(products, {
    fields: [leads.productId],
    references: [products.id],
  }),
  campaign: one(campaigns, {
    fields: [leads.campaignId],
    references: [campaigns.id],
  }),
  assignedTo: one(users, {
    fields: [leads.assignedTo],
    references: [users.id],
    relationName: "lead_assigned_to",
  }),
  interactions: many(leadInteractions),
  stageHistory: many(leadStageHistory),
  enrollments: many(enrollments),
}));

export const leadInteractionsRelations = relations(leadInteractions, ({ one }) => ({
  lead: one(leads, {
    fields: [leadInteractions.leadId],
    references: [leads.id],
  }),
  createdBy: one(users, {
    fields: [leadInteractions.createdBy],
    references: [users.id],
  }),
}));

export const leadStageHistoryRelations = relations(leadStageHistory, ({ one }) => ({
  lead: one(leads, {
    fields: [leadStageHistory.leadId],
    references: [leads.id],
  }),
}));

export const enrollmentsRelations = relations(enrollments, ({ one }) => ({
  lead: one(leads, { fields: [enrollments.leadId], references: [leads.id] }),
  product: one(products, {
    fields: [enrollments.productId],
    references: [products.id],
  }),
  creditedTo: one(users, {
    fields: [enrollments.creditedTo],
    references: [users.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  product: one(products, {
    fields: [tasks.productId],
    references: [products.id],
  }),
}));

export const kpiAssignmentsRelations = relations(kpiAssignments, ({ one }) => ({
  definition: one(kpiDefinitions, {
    fields: [kpiAssignments.kpiDefinitionId],
    references: [kpiDefinitions.id],
  }),
  user: one(users, { fields: [kpiAssignments.userId], references: [users.id] }),
  product: one(products, {
    fields: [kpiAssignments.productId],
    references: [products.id],
  }),
}));
