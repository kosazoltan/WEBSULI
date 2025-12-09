import { relations } from "drizzle-orm/relations";
import { users, aiGenerationRequests, emailSubscriptions, scheduledJobs, htmlFiles, materialViews, extraEmailAddresses, materialComments, materialLikes, materialRatings, pushSubscriptions, emailLogs, materialStats, materialTags, tags } from "./schema";

export const aiGenerationRequestsRelations = relations(aiGenerationRequests, ({one}) => ({
	user: one(users, {
		fields: [aiGenerationRequests.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	aiGenerationRequests: many(aiGenerationRequests),
	emailSubscriptions: many(emailSubscriptions),
	scheduledJobs: many(scheduledJobs),
	htmlFiles: many(htmlFiles),
	materialViews: many(materialViews),
	extraEmailAddresses: many(extraEmailAddresses),
	materialComments_userId: many(materialComments, {
		relationName: "materialComments_userId_users_id"
	}),
	materialComments_approvedBy: many(materialComments, {
		relationName: "materialComments_approvedBy_users_id"
	}),
	materialLikes: many(materialLikes),
	materialRatings: many(materialRatings),
	pushSubscriptions: many(pushSubscriptions),
}));

export const emailSubscriptionsRelations = relations(emailSubscriptions, ({one}) => ({
	user: one(users, {
		fields: [emailSubscriptions.userId],
		references: [users.id]
	}),
}));

export const scheduledJobsRelations = relations(scheduledJobs, ({one}) => ({
	user: one(users, {
		fields: [scheduledJobs.createdBy],
		references: [users.id]
	}),
}));

export const htmlFilesRelations = relations(htmlFiles, ({one, many}) => ({
	user: one(users, {
		fields: [htmlFiles.userId],
		references: [users.id]
	}),
	materialViews: many(materialViews),
	materialComments: many(materialComments),
	materialLikes: many(materialLikes),
	materialRatings: many(materialRatings),
	emailLogs: many(emailLogs),
	materialStats: many(materialStats),
	materialTags: many(materialTags),
}));

export const materialViewsRelations = relations(materialViews, ({one}) => ({
	user: one(users, {
		fields: [materialViews.userId],
		references: [users.id]
	}),
	htmlFile: one(htmlFiles, {
		fields: [materialViews.materialId],
		references: [htmlFiles.id]
	}),
}));

export const extraEmailAddressesRelations = relations(extraEmailAddresses, ({one}) => ({
	user: one(users, {
		fields: [extraEmailAddresses.addedBy],
		references: [users.id]
	}),
}));

export const materialCommentsRelations = relations(materialComments, ({one}) => ({
	htmlFile: one(htmlFiles, {
		fields: [materialComments.materialId],
		references: [htmlFiles.id]
	}),
	user_userId: one(users, {
		fields: [materialComments.userId],
		references: [users.id],
		relationName: "materialComments_userId_users_id"
	}),
	user_approvedBy: one(users, {
		fields: [materialComments.approvedBy],
		references: [users.id],
		relationName: "materialComments_approvedBy_users_id"
	}),
}));

export const materialLikesRelations = relations(materialLikes, ({one}) => ({
	htmlFile: one(htmlFiles, {
		fields: [materialLikes.materialId],
		references: [htmlFiles.id]
	}),
	user: one(users, {
		fields: [materialLikes.userId],
		references: [users.id]
	}),
}));

export const materialRatingsRelations = relations(materialRatings, ({one}) => ({
	htmlFile: one(htmlFiles, {
		fields: [materialRatings.materialId],
		references: [htmlFiles.id]
	}),
	user: one(users, {
		fields: [materialRatings.userId],
		references: [users.id]
	}),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({one}) => ({
	user: one(users, {
		fields: [pushSubscriptions.userId],
		references: [users.id]
	}),
}));

export const emailLogsRelations = relations(emailLogs, ({one}) => ({
	htmlFile: one(htmlFiles, {
		fields: [emailLogs.htmlFileId],
		references: [htmlFiles.id]
	}),
}));

export const materialStatsRelations = relations(materialStats, ({one}) => ({
	htmlFile: one(htmlFiles, {
		fields: [materialStats.materialId],
		references: [htmlFiles.id]
	}),
}));

export const materialTagsRelations = relations(materialTags, ({one}) => ({
	htmlFile: one(htmlFiles, {
		fields: [materialTags.materialId],
		references: [htmlFiles.id]
	}),
	tag: one(tags, {
		fields: [materialTags.tagId],
		references: [tags.id]
	}),
}));

export const tagsRelations = relations(tags, ({many}) => ({
	materialTags: many(materialTags),
}));