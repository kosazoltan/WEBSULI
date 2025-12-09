import {
  htmlFiles,
  users,
  emailSubscriptions,
  extraEmailAddresses,
  emailLogs,
  aiGenerationRequests,
  backups,
  materialViews,
  pushSubscriptions,
  tags,
  materialTags,
  materialStats,
  materialLikes,
  materialRatings,
  materialComments,
  scheduledJobs,
  weeklyEmailReports,
  systemPrompts,
  type HtmlFile,
  type InsertHtmlFile,
  type User,
  type UpsertUser,
  type EmailSubscription,
  type InsertEmailSubscription,
  type ExtraEmail,
  type InsertExtraEmail,
  type EmailLog,
  type InsertEmailLog,
  type AiGenerationRequest,
  type InsertAiGenerationRequest,
  type Backup,
  type InsertBackup,
  type MaterialView,
  type InsertMaterialView,
  type PushSubscription,
  type InsertPushSubscription,
  type Tag,
  type InsertTag,
  type MaterialTag,
  type MaterialStat,
  type MaterialLike,
  type MaterialRating,
  type MaterialComment,
  type ScheduledJob,
  type WeeklyEmailReport,
  type SystemPrompt,
} from "@shared/schema";

import { db } from "./db";
import { eq, desc, asc, gt, and, sql, inArray } from "drizzle-orm";

// PostgreSQL native arrays and jsonb - no JSON parsing helpers needed

export interface IStorage {
  // User operations - Required for Replit Auth and Email/Password Auth
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | null>;
  upsertUser(user: UpsertUser): Promise<User>;
  createUser(email: string, hashedPassword: string, firstName?: string, lastName?: string): Promise<User>;
  updatePassword(userId: string, hashedPassword: string): Promise<void>;
  updateLastSeenAt(userId: string): Promise<void>;

  // Admin user management operations
  getAllUsers(): Promise<User[]>;
  deleteUser(userId: string): Promise<boolean>;
  toggleUserBan(userId: string, banned: boolean): Promise<boolean>;
  toggleUserAdmin(userId: string, isAdmin: boolean): Promise<boolean>;

  // HTML file operations
  getAllHtmlFiles(): Promise<HtmlFile[]>;
  getHtmlFile(id: string): Promise<HtmlFile | undefined>;
  createHtmlFile(file: InsertHtmlFile, userId: string, classroom: number): Promise<HtmlFile>;
  updateHtmlFile(id: string, userId: string, updates: { title?: string; description?: string; classroom?: number; displayOrder?: number }): Promise<HtmlFile | null>;
  deleteHtmlFile(id: string, userId: string): Promise<boolean>;
  getNewFilesCount(userId: string): Promise<number>;
  getNewFiles(userId: string): Promise<HtmlFile[]>;

  // Email subscription operations
  getEmailSubscription(userId: string): Promise<EmailSubscription | undefined>;
  upsertEmailSubscription(subscription: InsertEmailSubscription): Promise<EmailSubscription>;
  getActiveEmailSubscriptions(): Promise<Array<EmailSubscription & { user?: User }>>;

  // Extra email operations
  addExtraEmail(email: string, classrooms: number[], addedBy: string | null): Promise<ExtraEmail>;
  updateExtraEmailClassrooms(id: string, classrooms: number[]): Promise<ExtraEmail | null>;
  getActiveExtraEmails(): Promise<ExtraEmail[]>;
  deleteExtraEmail(id: string): Promise<boolean>;

  // Email log operations
  createEmailLog(log: InsertEmailLog): Promise<EmailLog>;
  getEmailLogsByFileId(fileId: string): Promise<EmailLog[]>;
  getRecentEmailLogs(limit?: number): Promise<EmailLog[]>;

  // AI generation request operations
  createAiGenerationRequest(request: InsertAiGenerationRequest): Promise<AiGenerationRequest>;
  updateAiGenerationRequest(id: string, updates: Partial<InsertAiGenerationRequest>): Promise<AiGenerationRequest | null>;
  getAiGenerationRequestsByUser(userId: string): Promise<AiGenerationRequest[]>;
  getRecentAiGenerationRequests(limit?: number): Promise<AiGenerationRequest[]>;

  // Backup operations
  createBackup(name: string, createdBy: string): Promise<Backup>;
  getAllBackups(): Promise<Backup[]>;
  getBackup(id: string): Promise<Backup | undefined>;
  deleteBackup(id: string): Promise<boolean>;
  deleteOldBackups(keepCount: number): Promise<number>;
  restoreBackup(id: string): Promise<boolean>;

  // Material view tracking operations
  createMaterialView(view: InsertMaterialView): Promise<MaterialView>;
  getMaterialViewsByFile(materialId: string): Promise<MaterialView[]>;
  getRecentMaterialViews(limit?: number): Promise<Array<MaterialView & { user?: User; material?: HtmlFile }>>;
  getMaterialViewsCount(materialId: string): Promise<number>;

  // Push subscription operations
  createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription>;
  deletePushSubscription(endpoint: string): Promise<boolean>;
  getPushSubscription(endpoint: string): Promise<PushSubscription | undefined>;
  getAllPushSubscriptions(): Promise<PushSubscription[]>;
  getUserPushSubscriptions(userId: string): Promise<PushSubscription[]>;

  // Backup export operation
  exportBackupSnapshot(): Promise<{
    htmlFiles: HtmlFile[];
    users: User[];
    extraEmails: Array<Omit<ExtraEmail, 'classrooms'> & { classrooms: number[] }>;
    materialViews: MaterialView[];
    emailSubscriptions: Array<Omit<EmailSubscription, 'classrooms'> & { classrooms: number[] }>;
    tags: Tag[];
    systemPrompts: any[];
    emailLogs: EmailLog[];
  }>;

  // Backup import operation (restore from file-based backup)
  importBackupSnapshot(snapshotData: {
    htmlFiles: HtmlFile[];
    users: User[];
    extraEmails: Array<Omit<ExtraEmail, 'classrooms'> & { classrooms: number[] }>;
    materialViews?: MaterialView[];
    emailSubscriptions?: Array<Omit<EmailSubscription, 'classrooms'> & { classrooms: number[] }>;
    tags?: Tag[];
    systemPrompts?: any[];
    emailLogs?: EmailLog[];
  }): Promise<void>;

  // Statistics operations
  getOverallStats(): Promise<{
    totalMaterials: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
  }>;
  getMaterialStatsById(materialId: string): Promise<MaterialStat | null>;
  getTopMaterials(limit: number): Promise<Array<{
    id: string;
    title: string;
    classroom: number;
    totalViews: number | null;
    totalLikes: number | null;
  }>>;
  getClassroomDistribution(): Promise<Array<{
    classroom: number;
    count: number;
  }>>;
  getEmailDeliveryStats(): Promise<{ sent: number; failed: number }>;
  updateMaterialStats(materialId: string): Promise<void>;

  // Tag operations
  getAllTags(): Promise<Tag[]>;
  getTag(id: string): Promise<Tag | undefined>;
  createTag(name: string, description?: string, color?: string): Promise<Tag>;
  updateTag(id: string, updates: { name?: string; description?: string; color?: string }): Promise<Tag | null>;
  deleteTag(id: string): Promise<boolean>;
  getMaterialTags(materialId: string): Promise<Tag[]>;
  addMaterialTag(materialId: string, tagId: string): Promise<MaterialTag>;
  removeMaterialTag(materialId: string, tagId: string): Promise<boolean>;

  // Like operations
  addMaterialLike(materialId: string, fingerprint: string, userId?: string): Promise<MaterialLike>;
  removeMaterialLike(materialId: string, fingerprint: string): Promise<boolean>;
  getMaterialLikes(materialId: string): Promise<number>;
  hasUserLiked(materialId: string, fingerprint: string): Promise<boolean>;
  getUserByGoogleId(googleId: string): Promise<User | null>;
  getUserByEmail(email: string): Promise<User | null>;
  upsertUser(user: UpsertUser): Promise<User>;
}

export class DatabaseStorage implements IStorage {
  // User operations - Required for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByGoogleId(googleId: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.googleId, googleId));
    return user || null;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Strategy:
    // 1. If googleId provided, try to find by googleId
    // 2. If valid email provided, try to find by email
    // 3. Update existing or insert new

    let existingUser: User | undefined;

    if (userData.googleId) {
      [existingUser] = await db.select().from(users).where(eq(users.googleId, userData.googleId));
    }

    if (!existingUser && userData.email) {
      [existingUser] = await db.select().from(users).where(eq(users.email, userData.email));
    }

    if (existingUser) {
      // User exists, update it
      const updateData: Partial<typeof users.$inferInsert> = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        profileImageUrl: userData.profileImageUrl,
        updatedAt: new Date(),
      };

      // If linking Google Account to existing email account
      if (userData.googleId && !existingUser.googleId) {
        updateData.googleId = userData.googleId;
      }

      // Only update isAdmin if it's explicitly set in userData
      if (userData.isAdmin !== undefined) {
        updateData.isAdmin = userData.isAdmin;
      }

      const [updatedUser] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, existingUser.id))
        .returning();
      return updatedUser;
    }

    // If no existing user, insert new one
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id, // Fallback, though logic above handles most cases
        set: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        }
      })
      .returning();
    return user;
  }

  async updateLastSeenAt(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, userId));
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user || null;
  }

  async createUser(email: string, hashedPassword: string, firstName?: string, lastName?: string): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        firstName,
        lastName,
      })
      .returning();
    return user;
  }

  async updatePassword(userId: string, hashedPassword: string): Promise<void> {
    await db
      .update(users)
      .set({
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  }

  // Admin user management operations
  async getAllUsers(): Promise<User[]> {
    return await db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt));
  }

  async deleteUser(userId: string): Promise<boolean> {
    const result = await db
      .delete(users)
      .where(eq(users.id, userId))
      .returning();
    return result.length > 0;
  }

  async toggleUserBan(userId: string, banned: boolean): Promise<boolean> {
    const result = await db
      .update(users)
      .set({
        isBanned: banned,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return result.length > 0;
  }

  async toggleUserAdmin(userId: string, isAdmin: boolean): Promise<boolean> {
    const result = await db
      .update(users)
      .set({
        isAdmin: isAdmin,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return result.length > 0;
  }

  // HTML file operations
  async getAllHtmlFiles(): Promise<HtmlFile[]> {
    // Order by displayOrder (if set), then createdAt DESC
    // displayOrder=0 means no manual order (use createdAt)
    // OPTIMIZATION: Do NOT fetch the full 'content' (which can be 100MB+) for the list view
    // Return empty string for content to satisfy type interface
    return await db
      .select({
        id: htmlFiles.id,
        userId: htmlFiles.userId,
        title: htmlFiles.title,
        content: sql<string>`''`.as('content'), // Empty content for list view optimization
        description: htmlFiles.description,
        classroom: htmlFiles.classroom,
        contentType: htmlFiles.contentType,
        displayOrder: htmlFiles.displayOrder,
        createdAt: htmlFiles.createdAt
      })
      .from(htmlFiles)
      .orderBy(
        sql`CASE WHEN ${htmlFiles.displayOrder} = 0 THEN NULL ELSE ${htmlFiles.displayOrder} END ASC`,
        desc(htmlFiles.createdAt)
      ) as Promise<HtmlFile[]>;
  }

  async getHtmlFile(id: string): Promise<HtmlFile | undefined> {
    const [file] = await db
      .select()
      .from(htmlFiles)
      .where(eq(htmlFiles.id, id));
    return file;
  }

  async createHtmlFile(insertFile: InsertHtmlFile, userId: string, classroom: number): Promise<HtmlFile> {
    try {
      console.log('[STORAGE] createHtmlFile called with:', {
        titleLength: insertFile.title?.length || 0,
        contentLength: insertFile.content?.length || 0,
        classroom,
        userId
      });

      const [file] = await db
        .insert(htmlFiles)
        .values({ ...insertFile, userId, classroom })
        .returning();

      console.log('[STORAGE] File created successfully:', file.id);
      return file;
    } catch (error) {
      console.error('[STORAGE] Error creating file:', error);
      throw error;
    }
  }

  async updateHtmlFile(id: string, userId: string, updates: { title?: string; description?: string; classroom?: number; displayOrder?: number }): Promise<HtmlFile | null> {
    // NO AUTH - Public platform, no ownership or admin checks required
    // Get the file first to verify it exists
    const file = await this.getHtmlFile(id);
    if (!file) {
      return null;
    }

    const [updatedFile] = await db
      .update(htmlFiles)
      .set(updates)
      .where(eq(htmlFiles.id, id))
      .returning();

    return updatedFile || null;
  }

  async deleteHtmlFile(id: string, userId: string): Promise<boolean> {
    // NO AUTH - Public platform, no ownership or admin checks required
    // Get the file first to verify it exists
    const file = await this.getHtmlFile(id);
    if (!file) {
      return false;
    }

    const result = await db
      .delete(htmlFiles)
      .where(eq(htmlFiles.id, id))
      .returning();
    return result.length > 0;
  }

  async getNewFilesCount(userId: string): Promise<number> {
    const user = await this.getUser(userId);
    if (!user || !user.lastSeenAt) {
      // If user never checked, all files are new
      const allFiles = await this.getAllHtmlFiles();
      return allFiles.length;
    }

    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(htmlFiles)
      .where(gt(htmlFiles.createdAt, user.lastSeenAt));

    return Number(result[0]?.count || 0);
  }

  async getNewFiles(userId: string): Promise<HtmlFile[]> {
    const user = await this.getUser(userId);
    if (!user || !user.lastSeenAt) {
      // If user never checked, all files are new
      return await this.getAllHtmlFiles();
    }

    return await db
      .select()
      .from(htmlFiles)
      .where(gt(htmlFiles.createdAt, user.lastSeenAt))
      .orderBy(desc(htmlFiles.createdAt));
  }

  // Email subscription operations
  async getEmailSubscription(userId: string): Promise<EmailSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(emailSubscriptions)
      .where(eq(emailSubscriptions.userId, userId));
    return subscription as EmailSubscription | undefined;
  }

  async upsertEmailSubscription(subscriptionData: InsertEmailSubscription): Promise<EmailSubscription> {
    const [subscription] = await db
      .insert(emailSubscriptions)
      .values({
        ...subscriptionData,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: emailSubscriptions.userId,
        set: {
          isSubscribed: subscriptionData.isSubscribed,
          email: subscriptionData.email,
          classrooms: subscriptionData.classrooms,
          updatedAt: new Date(),
        },
      })
      .returning();

    return subscription;
  }

  async getActiveEmailSubscriptions(): Promise<Array<EmailSubscription & { user?: User }>> {
    const results = await db
      .select({
        id: emailSubscriptions.id,
        userId: emailSubscriptions.userId,
        email: emailSubscriptions.email,
        classrooms: emailSubscriptions.classrooms,
        isSubscribed: emailSubscriptions.isSubscribed,
        createdAt: emailSubscriptions.createdAt,
        updatedAt: emailSubscriptions.updatedAt,
        user: users,
      })
      .from(emailSubscriptions)
      .leftJoin(users, eq(emailSubscriptions.userId, users.id))
      .where(eq(emailSubscriptions.isSubscribed, true));

    return results.map(row => ({
      id: row.id,
      userId: row.userId,
      email: row.email,
      classrooms: row.classrooms,
      isSubscribed: row.isSubscribed,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      user: row.user || undefined,
    } as EmailSubscription & { user?: User }));
  }

  // Get all registered users with email addresses for notifications
  async getRegisteredUsersForNotifications(): Promise<User[]> {
    const registeredUsers = await db
      .select()
      .from(users)
      .where(sql`${users.email} IS NOT NULL AND ${users.email} != ''`);

    // Szűrjük ki a teszt és example.com címeket
    return registeredUsers.filter(user =>
      user.email &&
      !user.email.includes('@example.com') &&
      !user.email.includes('@empty.com') &&
      !user.email.includes('@test.com') &&
      !user.email.includes('@toggle.com')
    );
  }

  // Extra email address operations
  async addExtraEmail(email: string, classrooms: number[], addedBy: string | null): Promise<ExtraEmail> {
    // Check if email already exists
    const existingEmail = await db
      .select()
      .from(extraEmailAddresses)
      .where(eq(extraEmailAddresses.email, email))
      .limit(1);

    if (existingEmail.length > 0) {
      throw new Error('duplicate key value violates unique constraint');
    }

    const [extraEmail] = await db
      .insert(extraEmailAddresses)
      .values({
        email,
        classrooms,
        addedBy: addedBy || undefined,
        isActive: true,
      })
      .returning();

    return extraEmail;
  }

  async updateExtraEmailClassrooms(id: string, classrooms: number[]): Promise<ExtraEmail | null> {
    const [updated] = await db
      .update(extraEmailAddresses)
      .set({
        classrooms,
        updatedAt: new Date()
      })
      .where(eq(extraEmailAddresses.id, id))
      .returning();

    return updated || null;
  }

  async getActiveExtraEmails(): Promise<ExtraEmail[]> {
    return await db
      .select()
      .from(extraEmailAddresses)
      .where(eq(extraEmailAddresses.isActive, true));
  }

  async deleteExtraEmail(id: string): Promise<boolean> {
    const result = await db
      .delete(extraEmailAddresses)
      .where(eq(extraEmailAddresses.id, id))
      .returning();
    return result.length > 0;
  }

  // Email log operations
  async createEmailLog(log: InsertEmailLog): Promise<EmailLog> {
    const [emailLog] = await db
      .insert(emailLogs)
      .values(log)
      .returning();
    return emailLog;
  }

  async getEmailLogsByFileId(fileId: string): Promise<EmailLog[]> {
    return await db
      .select()
      .from(emailLogs)
      .where(eq(emailLogs.htmlFileId, fileId))
      .orderBy(desc(emailLogs.createdAt));
  }

  async getRecentEmailLogs(limit: number = 100): Promise<EmailLog[]> {
    return await db
      .select()
      .from(emailLogs)
      .orderBy(desc(emailLogs.createdAt))
      .limit(limit);
  }

  // AI generation request operations
  async createAiGenerationRequest(request: InsertAiGenerationRequest): Promise<AiGenerationRequest> {
    const [aiRequest] = await db
      .insert(aiGenerationRequests)
      .values(request)
      .returning();
    return aiRequest;
  }

  async updateAiGenerationRequest(id: string, updates: Partial<InsertAiGenerationRequest>): Promise<AiGenerationRequest | null> {
    const [updated] = await db
      .update(aiGenerationRequests)
      .set(updates)
      .where(eq(aiGenerationRequests.id, id))
      .returning();
    return updated || null;
  }

  async getAiGenerationRequestsByUser(userId: string): Promise<AiGenerationRequest[]> {
    return await db
      .select()
      .from(aiGenerationRequests)
      .where(eq(aiGenerationRequests.userId, userId))
      .orderBy(desc(aiGenerationRequests.createdAt));
  }

  async getRecentAiGenerationRequests(limit: number = 50): Promise<AiGenerationRequest[]> {
    return await db
      .select()
      .from(aiGenerationRequests)
      .orderBy(desc(aiGenerationRequests.createdAt))
      .limit(limit);
  }

  // Backup operations
  async createBackup(name: string, createdBy: string): Promise<Backup> {
    // Get all HTML files to backup
    const allFiles = await this.getAllHtmlFiles();

    // Create backup with all files data
    const [backup] = await db
      .insert(backups)
      .values({
        name,
        data: allFiles,
        createdBy,
      })
      .returning();

    // Automatically delete old backups (keep only last 3)
    await this.deleteOldBackups(3);

    return backup;
  }

  async getAllBackups(): Promise<Backup[]> {
    return await db
      .select()
      .from(backups)
      .orderBy(desc(backups.createdAt))
      .limit(3); // Only return the 3 most recent backups
  }

  async getBackup(id: string): Promise<Backup | undefined> {
    const [backup] = await db
      .select()
      .from(backups)
      .where(eq(backups.id, id));
    return backup;
  }

  async deleteBackup(id: string): Promise<boolean> {
    const result = await db
      .delete(backups)
      .where(eq(backups.id, id))
      .returning();
    return result.length > 0;
  }

  async deleteOldBackups(keepCount: number): Promise<number> {
    // Get all backups ordered by creation date
    const allBackups = await db
      .select({ id: backups.id })
      .from(backups)
      .orderBy(desc(backups.createdAt));

    // If we have more than keepCount, delete the old ones
    if (allBackups.length > keepCount) {
      const backupsToDelete = allBackups.slice(keepCount);
      const idsToDelete = backupsToDelete.map(b => b.id);

      // Bulk delete instead of loop
      if (idsToDelete.length > 0) {
        await db.delete(backups).where(inArray(backups.id, idsToDelete));
      }

      return idsToDelete.length;
    }

    return 0;
  }

  async restoreBackup(id: string): Promise<boolean> {
    const backup = await this.getBackup(id);
    if (!backup) {
      return false;
    }

    // Delete all current HTML files
    await db.delete(htmlFiles);

    // Restore files from backup - bulk insert instead of loop
    const filesToRestore = backup.data as HtmlFile[];

    if (filesToRestore.length > 0) {
      await db.insert(htmlFiles).values(
        filesToRestore.map(file => ({
          id: file.id,
          userId: file.userId,
          title: file.title,
          content: file.content,
          description: file.description,
          classroom: file.classroom,
          createdAt: file.createdAt,
        }))
      );
    }

    return true;
  }

  // Material view tracking operations
  async createMaterialView(view: InsertMaterialView): Promise<MaterialView> {
    const [materialView] = await db
      .insert(materialViews)
      .values(view)
      .returning();
    return materialView;
  }

  async getMaterialViewsByFile(materialId: string): Promise<MaterialView[]> {
    return await db
      .select()
      .from(materialViews)
      .where(eq(materialViews.materialId, materialId))
      .orderBy(desc(materialViews.viewedAt));
  }

  async getRecentMaterialViews(limit: number = 50): Promise<Array<MaterialView & { user?: User; material?: HtmlFile }>> {
    // Use JOIN to avoid N+1 queries - single database query instead of 1 + (limit * 2)
    const results = await db
      .select()
      .from(materialViews)
      .leftJoin(users, eq(materialViews.userId, users.id))
      .leftJoin(htmlFiles, eq(materialViews.materialId, htmlFiles.id))
      .orderBy(desc(materialViews.viewedAt))
      .limit(limit);

    // Transform results to match expected return type
    return results.map(row => ({
      id: row.material_views.id,
      userId: row.material_views.userId,
      materialId: row.material_views.materialId,
      viewedAt: row.material_views.viewedAt,
      userAgent: row.material_views.userAgent,
      user: row.users || undefined,
      material: row.html_files || undefined,
    }));
  }

  async getMaterialViewsCount(materialId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(materialViews)
      .where(eq(materialViews.materialId, materialId));

    return Number(result[0]?.count || 0);
  }

  // Push subscription operations
  async createPushSubscription(subscription: InsertPushSubscription): Promise<PushSubscription> {
    // Check if subscription already exists (by endpoint)
    const [existing] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint));

    if (existing) {
      // Update existing subscription
      const [updated] = await db
        .update(pushSubscriptions)
        .set({
          userId: subscription.userId,
          email: subscription.email,
          keys: subscription.keys,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
        .returning();

      return updated;
    }

    // Create new subscription
    const [newSubscription] = await db
      .insert(pushSubscriptions)
      .values(subscription)
      .returning();

    return newSubscription;
  }

  async deletePushSubscription(endpoint: string): Promise<boolean> {
    const result = await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .returning();
    return result.length > 0;
  }

  async getPushSubscription(endpoint: string): Promise<PushSubscription | undefined> {
    const [subscription] = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));

    return subscription;
  }

  async getAllPushSubscriptions(): Promise<PushSubscription[]> {
    return await db.select().from(pushSubscriptions);
  }

  async getUserPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
  }

  // Statistics operations
  async getOverallStats(): Promise<{
    totalMaterials: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
  }> {
    const [materialsCount] = await db.select({ count: sql<number>`count(*)` }).from(htmlFiles);
    const [viewsCount] = await db.select({ count: sql<number>`count(*)` }).from(materialViews);
    const [likesCount] = await db.select({ count: sql<number>`count(*)` }).from(materialLikes);
    const [commentsCount] = await db.select({ count: sql<number>`count(*)` }).from(materialComments);

    return {
      totalMaterials: Number(materialsCount?.count || 0),
      totalViews: Number(viewsCount?.count || 0),
      totalLikes: Number(likesCount?.count || 0),
      totalComments: Number(commentsCount?.count || 0),
    };
  }

  async getMaterialStatsById(materialId: string): Promise<MaterialStat | null> {
    const [stats] = await db
      .select()
      .from(materialStats)
      .where(eq(materialStats.materialId, materialId));
    return stats || null;
  }

  async getTopMaterials(limit: number): Promise<Array<{
    id: string;
    title: string;
    classroom: number;
    totalViews: number | null;
    totalLikes: number | null;
  }>> {
    return await db
      .select({
        id: htmlFiles.id,
        title: htmlFiles.title,
        classroom: htmlFiles.classroom,
        totalViews: materialStats.totalViews,
        totalLikes: materialStats.totalLikes,
      })
      .from(htmlFiles)
      .leftJoin(materialStats, eq(htmlFiles.id, materialStats.materialId))
      .orderBy(desc(materialStats.totalViews))
      .limit(limit);
  }

  async getClassroomDistribution(): Promise<Array<{
    classroom: number;
    count: number;
  }>> {
    return await db
      .select({
        classroom: htmlFiles.classroom,
        count: sql<number>`count(*)`,
      })
      .from(htmlFiles)
      .groupBy(htmlFiles.classroom)
      .orderBy(htmlFiles.classroom);
  }

  async getEmailDeliveryStats(): Promise<{ sent: number; failed: number }> {
    const [sentCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailLogs)
      .where(eq(emailLogs.status, 'sent'));

    const [failedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(emailLogs)
      .where(eq(emailLogs.status, 'failed'));

    return {
      sent: Number(sentCount?.count || 0),
      failed: Number(failedCount?.count || 0),
    };
  }

  async updateMaterialStats(materialId: string): Promise<void> {
    const [viewsResult] = await db.select({ count: sql<number>`count(*)` }).from(materialViews).where(eq(materialViews.materialId, materialId));
    const [uniqueViewersResult] = await db.select({ count: sql<number>`count(DISTINCT user_id)` }).from(materialViews).where(eq(materialViews.materialId, materialId));
    const [likesResult] = await db.select({ count: sql<number>`count(*)` }).from(materialLikes).where(eq(materialLikes.materialId, materialId));
    const [lastViewResult] = await db.select({ viewedAt: materialViews.viewedAt }).from(materialViews).where(eq(materialViews.materialId, materialId)).orderBy(desc(materialViews.viewedAt)).limit(1);

    await db.insert(materialStats).values({
      materialId,
      totalViews: Number(viewsResult?.count || 0),
      uniqueViewers: Number(uniqueViewersResult?.count || 0),
      totalLikes: Number(likesResult?.count || 0),
      lastViewedAt: lastViewResult?.viewedAt || null,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: materialStats.materialId,
      set: {
        totalViews: Number(viewsResult?.count || 0),
        uniqueViewers: Number(uniqueViewersResult?.count || 0),
        totalLikes: Number(likesResult?.count || 0),
        lastViewedAt: lastViewResult?.viewedAt || null,
        updatedAt: new Date(),
      },
    });
  }

  // Tag operations
  async getAllTags(): Promise<Tag[]> {
    return await db.select().from(tags).orderBy(tags.name);
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag;
  }

  async createTag(name: string, description?: string, color?: string): Promise<Tag> {
    const [tag] = await db.insert(tags).values({ name, description, color }).returning();
    return tag;
  }

  async updateTag(id: string, updates: { name?: string; description?: string; color?: string }): Promise<Tag | null> {
    const [tag] = await db.update(tags).set(updates).where(eq(tags.id, id)).returning();
    return tag || null;
  }

  async deleteTag(id: string): Promise<boolean> {
    const result = await db.delete(tags).where(eq(tags.id, id)).returning();
    return result.length > 0;
  }

  async getMaterialTags(materialId: string): Promise<Tag[]> {
    const result = await db.select({ id: tags.id, name: tags.name, description: tags.description, color: tags.color, createdAt: tags.createdAt }).from(materialTags).innerJoin(tags, eq(materialTags.tagId, tags.id)).where(eq(materialTags.materialId, materialId));
    return result;
  }

  async addMaterialTag(materialId: string, tagId: string): Promise<MaterialTag> {
    const [materialTag] = await db.insert(materialTags).values({ materialId, tagId }).returning();
    return materialTag;
  }

  async removeMaterialTag(materialId: string, tagId: string): Promise<boolean> {
    const result = await db.delete(materialTags).where(and(eq(materialTags.materialId, materialId), eq(materialTags.tagId, tagId))).returning();
    return result.length > 0;
  }

  // Like operations
  async addMaterialLike(materialId: string, fingerprint: string, userId?: string): Promise<MaterialLike> {
    const [like] = await db.insert(materialLikes).values({ materialId, fingerprint, userId: userId || null }).returning();
    return like;
  }

  async removeMaterialLike(materialId: string, fingerprint: string): Promise<boolean> {
    const result = await db.delete(materialLikes).where(and(eq(materialLikes.materialId, materialId), eq(materialLikes.fingerprint, fingerprint))).returning();
    return result.length > 0;
  }

  async getMaterialLikes(materialId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(materialLikes).where(eq(materialLikes.materialId, materialId));
    return Number(result?.count || 0);
  }

  async hasUserLiked(materialId: string, fingerprint: string): Promise<boolean> {
    const [result] = await db.select().from(materialLikes).where(and(eq(materialLikes.materialId, materialId), eq(materialLikes.fingerprint, fingerprint))).limit(1);
    return !!result;
  }

  // Export complete backup snapshot
  async exportBackupSnapshot(): Promise<{
    htmlFiles: HtmlFile[];
    users: User[];
    extraEmails: Array<Omit<ExtraEmail, 'classrooms'> & { classrooms: number[] }>;
    materialViews: MaterialView[];
    emailSubscriptions: Array<Omit<EmailSubscription, 'classrooms'> & { classrooms: number[] }>;
    tags: Tag[];
    systemPrompts: SystemPrompt[];
    emailLogs: EmailLog[];
  }> {
    // Fetch all data from database tables
    const htmlFilesData = await this.getAllHtmlFiles();
    const usersData = await this.getAllUsers();

    // Fetch extra emails
    const extraEmailsData = await db.select().from(extraEmailAddresses).orderBy(desc(extraEmailAddresses.createdAt));

    // Fetch material views
    const materialViewsData = await db.select().from(materialViews).orderBy(desc(materialViews.viewedAt));

    // Fetch email subscriptions
    const emailSubscriptionsData = await db.select().from(emailSubscriptions);

    // Fetch tags
    const tagsData = await this.getAllTags();

    // Fetch system prompts
    const systemPromptsData = await db.select().from(systemPrompts).orderBy(systemPrompts.name);

    // Fetch email logs
    const emailLogsData = await this.getRecentEmailLogs(10000); // Get all email logs

    return {
      htmlFiles: htmlFilesData,
      users: usersData,
      extraEmails: extraEmailsData,
      materialViews: materialViewsData,
      emailSubscriptions: emailSubscriptionsData,
      tags: tagsData,
      systemPrompts: systemPromptsData,
      emailLogs: emailLogsData,
    };
  }

  // Import complete backup snapshot (restore from file-based backup)
  async importBackupSnapshot(snapshotData: {
    htmlFiles: HtmlFile[];
    users: User[];
    extraEmails: Array<Omit<ExtraEmail, 'classrooms'> & { classrooms: number[] }>;
    materialViews?: MaterialView[];
    emailSubscriptions?: Array<Omit<EmailSubscription, 'classrooms'> & { classrooms: number[] }>;
    tags?: Tag[];
    systemPrompts?: any[];
    emailLogs?: EmailLog[];
  }): Promise<void> {
    console.log('[RESTORE] Starting backup restoration...');
    console.log('[RESTORE] Snapshot contents:', {
      htmlFiles: snapshotData.htmlFiles.length,
      users: snapshotData.users.length,
      extraEmails: snapshotData.extraEmails.length,
      materialViews: snapshotData.materialViews?.length || 0,
      emailSubscriptions: snapshotData.emailSubscriptions?.length || 0,
      tags: snapshotData.tags?.length || 0,
      systemPrompts: snapshotData.systemPrompts?.length || 0,
      emailLogs: snapshotData.emailLogs?.length || 0,
    });

    // Validate required fields
    if (!snapshotData.htmlFiles || !snapshotData.users) {
      throw new Error('Snapshot validation failed: htmlFiles and users are required');
    }

    // Single transaction for atomic restore
    await db.transaction(async (tx) => {
      console.log('[RESTORE] Transaction started - deleting existing data...');

      // Delete in reverse FK dependency order
      await tx.delete(materialLikes);
      await tx.delete(materialRatings);
      await tx.delete(materialComments);
      await tx.delete(materialTags);
      await tx.delete(materialStats);
      await tx.delete(materialViews);
      await tx.delete(emailLogs);
      await tx.delete(pushSubscriptions);
      await tx.delete(aiGenerationRequests);
      await tx.delete(backups);
      await tx.delete(htmlFiles);
      await tx.delete(extraEmailAddresses);
      await tx.delete(emailSubscriptions);
      await tx.delete(tags);
      await tx.delete(systemPrompts);
      await tx.delete(users);
      await tx.delete(weeklyEmailReports);
      await tx.delete(scheduledJobs);

      console.log('[RESTORE] All tables cleared');

      // Insert parent tables first
      console.log('[RESTORE] Inserting users...');
      if (snapshotData.users.length > 0) {
        await tx.insert(users).values(snapshotData.users);
      }

      console.log('[RESTORE] Inserting tags...');
      if (snapshotData.tags && snapshotData.tags.length > 0) {
        await tx.insert(tags).values(snapshotData.tags);
      }

      console.log('[RESTORE] Inserting system prompts...');
      if (snapshotData.systemPrompts && snapshotData.systemPrompts.length > 0) {
        await tx.insert(systemPrompts).values(snapshotData.systemPrompts);
      }

      // Insert htmlFiles
      console.log('[RESTORE] Inserting htmlFiles...');
      if (snapshotData.htmlFiles.length > 0) {
        await tx.insert(htmlFiles).values(snapshotData.htmlFiles);
      }

      // Insert extra emails
      console.log('[RESTORE] Inserting extra emails...');
      if (snapshotData.extraEmails && snapshotData.extraEmails.length > 0) {
        await tx.insert(extraEmailAddresses).values(snapshotData.extraEmails);
      }

      // Insert email subscriptions
      console.log('[RESTORE] Inserting email subscriptions...');
      if (snapshotData.emailSubscriptions && snapshotData.emailSubscriptions.length > 0) {
        await tx.insert(emailSubscriptions).values(snapshotData.emailSubscriptions);
      }

      // Insert relation tables
      console.log('[RESTORE] Inserting material views...');
      if (snapshotData.materialViews && snapshotData.materialViews.length > 0) {
        // Chunk inserts for large datasets (200 rows per batch)
        const chunkSize = 200;
        for (let i = 0; i < snapshotData.materialViews.length; i += chunkSize) {
          const chunk = snapshotData.materialViews.slice(i, i + chunkSize);
          await tx.insert(materialViews).values(chunk);
        }
      }

      console.log('[RESTORE] Inserting email logs...');
      if (snapshotData.emailLogs && snapshotData.emailLogs.length > 0) {
        // Chunk inserts for large datasets
        const chunkSize = 200;
        for (let i = 0; i < snapshotData.emailLogs.length; i += chunkSize) {
          const chunk = snapshotData.emailLogs.slice(i, i + chunkSize);
          await tx.insert(emailLogs).values(chunk);
        }
      }

      console.log('[RESTORE] Transaction completed successfully');
    });

    console.log('[RESTORE] ✅ Backup restoration complete!');
  }
}

export const storage = new DatabaseStorage();
