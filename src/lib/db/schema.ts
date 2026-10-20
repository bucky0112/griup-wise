import { pgTable, uuid, text, integer, boolean, numeric, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enum for question types
export const questionTypeEnum = ['single', 'multiple', 'boolean', 'short_text', 'numeric'] as const;
export type QuestionType = typeof questionTypeEnum[number];

// Admins table (管理者帳號)
export const admins = pgTable('admins', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailUnique: unique('admins_email_unique').on(table.email),
}));

// Classes table (班級)
export const classes = pgTable('classes', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: text('title').notNull(),
  expectedSize: integer('expected_size'), // 預期總人數（純參考）
  targetGroupSize: integer('target_group_size'), // 理想每組人數（純參考）
  createdBy: uuid('created_by').notNull().references(() => admins.id), // 管理者識別
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // 軟刪除時間，null 表示未刪除
});

// Quizzes table (測驗)
export const quizzes = pgTable('quizzes', {
  id: uuid('id').defaultRandom().primaryKey(),
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  isActive: boolean('is_active').default(false).notNull(), // 是否開放作答
  showGroupPublicly: boolean('show_group_publicly').default(false).notNull(), // 是否讓學生可看分組名單
  createdBy: uuid('created_by').notNull().references(() => admins.id), // 測驗建立者
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }), // 軟刪除時間，null 表示未刪除
}, (table) => ({
  classActiveIndex: index('quiz_class_active_idx').on(table.classId, table.isActive),
}));

// Questions table (題目)
export const questions = pgTable('questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  type: text('type').$type<QuestionType>().notNull(),
  prompt: text('prompt').notNull(),
  codeSnippet: text('code_snippet'), // 程式碼片段
  codeLanguage: text('code_language'), // 程式碼語言
  options: jsonb('options'), // 單選或多選選項
  answerKey: jsonb('answer_key').notNull(), // 正確答案
  score: numeric('score').notNull(), // 題目配分
  orderIndex: integer('order_index').notNull(),
  responseFormat: text('response_format').$type<'text' | 'code'>(), // 對於 short_text 問題的回答格式
  expectedLanguage: text('expected_language'), // 程式碼問題的預期語言
  gradingInstructions: text('grading_instructions'), // 人工評分指導
}, (table) => ({
  quizOrderIndex: index('question_quiz_order_idx').on(table.quizId, table.orderIndex),
}));

// Participants table (參與者)
export const participants = pgTable('participants', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  studentNo: text('student_no').notNull(), // 建議「去空白 + 大寫」後存
  uniqueKey: text('unique_key').notNull(), // 格式 ${quiz_id}:${student_no}
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  quizStudentUnique: unique('participants_quiz_student_unique').on(table.quizId, table.studentNo),
  uniqueKeyUnique: unique('participants_unique_key_unique').on(table.uniqueKey),
}));

// Submissions table (交卷)
export const submissions = pgTable('submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  totalScore: numeric('total_score').default('0').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  quizParticipantUnique: unique('submissions_quiz_participant_unique').on(table.quizId, table.participantId),
}));

// Answers table (各題作答)
export const answers = pgTable('answers', {
  id: uuid('id').defaultRandom().primaryKey(),
  submissionId: uuid('submission_id').notNull().references(() => submissions.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  response: jsonb('response').notNull(), // 學生答案
  earnedScore: numeric('earned_score').default('0').notNull(),
  reviewStatus: text('review_status').$type<'auto' | 'pending' | 'reviewed'>().default('auto').notNull(), // 評分狀態
  reviewedBy: uuid('reviewed_by').references(() => admins.id), // 評分管理者
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }), // 評分時間
  reviewFeedback: text('review_feedback'), // 評分回饋
  manualScore: numeric('manual_score'), // 人工評分，覆蓋 earnedScore
}, (table) => ({
  submissionQuestionUnique: unique('answers_submission_question_unique').on(table.submissionId, table.questionId),
}));

// Grouping Runs table (分組執行記錄)
export const groupingRuns = pgTable('grouping_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').notNull().references(() => admins.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  strategy: text('strategy').notNull(), // 'snake_by_score'
  config: jsonb('config').notNull(), // { target_group_size, include_unsubmitted, min_groups, max_groups, sort_by }
  status: text('status').notNull(), // 'active' | 'archived'
});

// Grouping Events table (分組觸發事件記錄)
export const groupingEvents = pgTable('grouping_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), // 'submission' | 'manual_trigger' | 'config_change'
  participantId: uuid('participant_id').references(() => participants.id, { onDelete: 'cascade' }), // Null for non-participant events
  oldRankingHash: text('old_ranking_hash'), // Hash of ranking before this event
  newRankingHash: text('new_ranking_hash'), // Hash of ranking after this event
  triggerMetadata: jsonb('trigger_metadata'), // Additional event-specific data
  shouldTriggerGrouping: boolean('should_trigger_grouping').notNull(), // Whether this event should trigger re-grouping
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  quizCreatedAtIndex: index('grouping_events_quiz_created_idx').on(table.quizId, table.createdAt),
  eventTypeIndex: index('grouping_events_type_idx').on(table.eventType),
}));

// Groups table (分組紀錄)
export const groups = pgTable('groups', {
  id: uuid('id').defaultRandom().primaryKey(),
  quizId: uuid('quiz_id').notNull().references(() => quizzes.id, { onDelete: 'cascade' }),
  groupingRunId: uuid('grouping_run_id').references(() => groupingRuns.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // 例如「第 1 組」
  orderIndex: integer('order_index').notNull(),
  notes: text('notes'), // 組別備註
}, (table) => ({
  quizOrderUnique: unique('groups_quiz_order_unique').on(table.quizId, table.orderIndex),
}));

// Group Members table (組員)
export const groupMembers = pgTable('group_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  groupId: uuid('group_id').notNull().references(() => groups.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  rankIndex: integer('rank_index').notNull(), // 紀錄分配順序（蛇形分配追蹤用）
}, (table) => ({
  groupParticipantUnique: unique('group_members_group_participant_unique').on(table.groupId, table.participantId),
}));

// Relations
export const adminsRelations = relations(admins, ({ many }) => ({
  classes: many(classes),
  quizzes: many(quizzes),
  groupingRuns: many(groupingRuns),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  createdBy: one(admins, {
    fields: [classes.createdBy],
    references: [admins.id],
  }),
  quizzes: many(quizzes),
}));

export const quizzesRelations = relations(quizzes, ({ one, many }) => ({
  class: one(classes, {
    fields: [quizzes.classId],
    references: [classes.id],
  }),
  createdBy: one(admins, {
    fields: [quizzes.createdBy],
    references: [admins.id],
  }),
  questions: many(questions),
  participants: many(participants),
  submissions: many(submissions),
  groups: many(groups),
  groupingRuns: many(groupingRuns),
  groupingEvents: many(groupingEvents),
}));

export const questionsRelations = relations(questions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [questions.quizId],
    references: [quizzes.id],
  }),
  answers: many(answers),
}));

export const participantsRelations = relations(participants, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [participants.quizId],
    references: [quizzes.id],
  }),
  submissions: many(submissions),
  groupMembers: many(groupMembers),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [submissions.quizId],
    references: [quizzes.id],
  }),
  participant: one(participants, {
    fields: [submissions.participantId],
    references: [participants.id],
  }),
  answers: many(answers),
}));

export const answersRelations = relations(answers, ({ one }) => ({
  submission: one(submissions, {
    fields: [answers.submissionId],
    references: [submissions.id],
  }),
  question: one(questions, {
    fields: [answers.questionId],
    references: [questions.id],
  }),
}));

export const groupingRunsRelations = relations(groupingRuns, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [groupingRuns.quizId],
    references: [quizzes.id],
  }),
  createdBy: one(admins, {
    fields: [groupingRuns.createdBy],
    references: [admins.id],
  }),
  groups: many(groups),
}));

export const groupingEventsRelations = relations(groupingEvents, ({ one }) => ({
  quiz: one(quizzes, {
    fields: [groupingEvents.quizId],
    references: [quizzes.id],
  }),
  participant: one(participants, {
    fields: [groupingEvents.participantId],
    references: [participants.id],
  }),
}));

export const groupsRelations = relations(groups, ({ one, many }) => ({
  quiz: one(quizzes, {
    fields: [groups.quizId],
    references: [quizzes.id],
  }),
  groupingRun: one(groupingRuns, {
    fields: [groups.groupingRunId],
    references: [groupingRuns.id],
  }),
  members: many(groupMembers),
}));

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  participant: one(participants, {
    fields: [groupMembers.participantId],
    references: [participants.id],
  }),
}));