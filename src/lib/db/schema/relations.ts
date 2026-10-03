import { relations } from "drizzle-orm";
import { brands } from "./brands";
import { campaignBrands, campaigns } from "./campaigns";
import { recurringRules } from "./recurring-rules";
import { requestRouting, requests } from "./requests";
import { sbus } from "./sbus";
import { sbuCatalogItems, sbuItemStatus } from "./sbu-catalog";
import {
  activityLog,
  checklistItems,
  comments,
  taskCollaborators,
  taskLabels,
  taskSbus,
  taskWatchers,
} from "./task-relations";
import { tasks } from "./tasks";
import { users } from "./users";

export const usersRelations = relations(users, ({ one, many }) => ({
  sbu: one(sbus, { fields: [users.sbuId], references: [sbus.id] }),
  assignedTasks: many(tasks, { relationName: "task_assignee" }),
}));

export const sbusRelations = relations(sbus, ({ one, many }) => ({
  hoOwner: one(users, { fields: [sbus.hoOwnerId], references: [users.id] }),
  members: many(users),
  itemStatuses: many(sbuItemStatus),
}));

export const brandsRelations = relations(brands, ({ many }) => ({
  campaigns: many(campaignBrands),
  tasks: many(tasks),
}));

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  owner: one(users, { fields: [campaigns.ownerId], references: [users.id] }),
  brands: many(campaignBrands),
  tasks: many(tasks),
  recurringRules: many(recurringRules),
}));

export const campaignBrandsRelations = relations(campaignBrands, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignBrands.campaignId],
    references: [campaigns.id],
  }),
  brand: one(brands, { fields: [campaignBrands.brandId], references: [brands.id] }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  assignee: one(users, {
    fields: [tasks.assigneeId],
    references: [users.id],
    relationName: "task_assignee",
  }),
  creator: one(users, { fields: [tasks.creatorId], references: [users.id] }),
  campaign: one(campaigns, { fields: [tasks.campaignId], references: [campaigns.id] }),
  brand: one(brands, { fields: [tasks.brandId], references: [brands.id] }),
  recurringRule: one(recurringRules, {
    fields: [tasks.recurringRuleId],
    references: [recurringRules.id],
  }),
  collaborators: many(taskCollaborators),
  sbus: many(taskSbus),
  labels: many(taskLabels),
  checklist: many(checklistItems),
  watchers: many(taskWatchers),
  comments: many(comments),
  activity: many(activityLog),
}));

export const taskCollaboratorsRelations = relations(taskCollaborators, ({ one }) => ({
  task: one(tasks, { fields: [taskCollaborators.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskCollaborators.userId], references: [users.id] }),
}));

export const taskSbusRelations = relations(taskSbus, ({ one }) => ({
  task: one(tasks, { fields: [taskSbus.taskId], references: [tasks.id] }),
  sbu: one(sbus, { fields: [taskSbus.sbuId], references: [sbus.id] }),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one }) => ({
  task: one(tasks, { fields: [checklistItems.taskId], references: [tasks.id] }),
  sbu: one(sbus, { fields: [checklistItems.sbuId], references: [sbus.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, { fields: [comments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));

export const recurringRulesRelations = relations(recurringRules, ({ one }) => ({
  fixedAssignee: one(users, {
    fields: [recurringRules.fixedAssigneeId],
    references: [users.id],
  }),
  campaign: one(campaigns, {
    fields: [recurringRules.campaignId],
    references: [campaigns.id],
  }),
}));

export const requestsRelations = relations(requests, ({ one }) => ({
  requesterSbu: one(sbus, { fields: [requests.requesterSbuId], references: [sbus.id] }),
  acceptedBy: one(users, { fields: [requests.acceptedById], references: [users.id] }),
  task: one(tasks, { fields: [requests.taskId], references: [tasks.id] }),
}));

export const requestRoutingRelations = relations(requestRouting, ({ one }) => ({
  sbu: one(sbus, { fields: [requestRouting.sbuId], references: [sbus.id] }),
  assignee: one(users, { fields: [requestRouting.assigneeId], references: [users.id] }),
}));

export const sbuCatalogItemsRelations = relations(sbuCatalogItems, ({ one, many }) => ({
  defaultRecurringRule: one(recurringRules, {
    fields: [sbuCatalogItems.defaultRecurringRuleId],
    references: [recurringRules.id],
  }),
  statuses: many(sbuItemStatus),
}));

export const sbuItemStatusRelations = relations(sbuItemStatus, ({ one }) => ({
  catalogItem: one(sbuCatalogItems, {
    fields: [sbuItemStatus.catalogItemId],
    references: [sbuCatalogItems.id],
  }),
  sbu: one(sbus, { fields: [sbuItemStatus.sbuId], references: [sbus.id] }),
  task: one(tasks, { fields: [sbuItemStatus.taskId], references: [tasks.id] }),
}));
