import { z } from 'zod';
import * as bcrypt from 'bcryptjs';
import { db } from './db';
import { admins, participants, quizzes } from './db/schema';
import { eq, and } from 'drizzle-orm';

export const adminLoginSchema = z.object({
  email: z.string().email('請輸入有效的電子郵件'),
  password: z.string().min(1, '請輸入密碼'),
});

export const studentLoginSchema = z.object({
  displayName: z.string().min(1, '請輸入姓名'),
  studentNo: z.string().min(1, '請輸入學號'),
  quizId: z.string().uuid('無效的測驗ID'),
});

export type AdminLoginData = z.infer<typeof adminLoginSchema>;
export type StudentLoginData = z.infer<typeof studentLoginSchema>;

export interface AdminSession {
  type: 'admin';
  id: string;
  name: string;
  email: string;
}

export interface StudentSession {
  type: 'student';
  participantId: string;
  quizId: string;
  displayName: string;
  studentNo: string;
}

export type UserSession = AdminSession | StudentSession;

export async function verifyAdmin(email: string, password: string): Promise<AdminSession | null> {
  const admin = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email))
    .limit(1);

  if (admin.length === 0) {
    return null;
  }

  const isValidPassword = await bcrypt.compare(password, admin[0].passwordHash);
  if (!isValidPassword) {
    return null;
  }

  return {
    type: 'admin',
    id: admin[0].id,
    name: admin[0].name,
    email: admin[0].email,
  };
}

export async function authenticateStudent(
  displayName: string,
  studentNo: string,
  quizId: string
): Promise<StudentSession | null> {
  // Normalize student number (trim whitespace, uppercase)
  const normalizedStudentNo = studentNo.trim().toUpperCase();

  // Check if quiz exists and is active
  const quiz = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.isActive, true)))
    .limit(1);

  if (quiz.length === 0) {
    return null;
  }

  // Check if participant already exists
  let participant = await db
    .select()
    .from(participants)
    .where(and(
      eq(participants.quizId, quizId),
      eq(participants.studentNo, normalizedStudentNo)
    ))
    .limit(1);

  // If participant doesn't exist, create new one
  if (participant.length === 0) {
    const uniqueKey = `${quizId}:${normalizedStudentNo}`;

    const newParticipant = await db
      .insert(participants)
      .values({
        quizId,
        displayName: displayName.trim(),
        studentNo: normalizedStudentNo,
        uniqueKey,
      })
      .returning();

    participant = newParticipant;
  }

  return {
    type: 'student',
    participantId: participant[0].id,
    quizId,
    displayName: participant[0].displayName,
    studentNo: participant[0].studentNo,
  };
}