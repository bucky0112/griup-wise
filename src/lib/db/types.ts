import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  classes,
  quizzes,
  questions,
  participants,
  submissions,
  answers,
  groups,
  groupMembers
} from './schema';

// Select types (complete entities from database)
export type Class = InferSelectModel<typeof classes>;
export type Quiz = InferSelectModel<typeof quizzes>;
export type Question = InferSelectModel<typeof questions>;
export type Participant = InferSelectModel<typeof participants>;
export type Submission = InferSelectModel<typeof submissions>;
export type Answer = InferSelectModel<typeof answers>;
export type Group = InferSelectModel<typeof groups>;
export type GroupMember = InferSelectModel<typeof groupMembers>;

// Insert types (for creating new entities)
export type NewClass = InferInsertModel<typeof classes>;
export type NewQuiz = InferInsertModel<typeof quizzes>;
export type NewQuestion = InferInsertModel<typeof questions>;
export type NewParticipant = InferInsertModel<typeof participants>;
export type NewSubmission = InferInsertModel<typeof submissions>;
export type NewAnswer = InferInsertModel<typeof answers>;
export type NewGroup = InferInsertModel<typeof groups>;
export type NewGroupMember = InferInsertModel<typeof groupMembers>;