import { eq } from 'drizzle-orm';
import { db, quizzes } from '../db';

type DbExecutor = Pick<typeof db, 'select'>;

/**
 * Serializes every change to a quiz's grouping. Call it as the first statement of the transaction so all
 * grouping writers take locks in the same order. FOR NO KEY UPDATE does not conflict with the FOR KEY SHARE
 * locks that participant and submission inserts take through their foreign keys, so students are not blocked.
 */
export async function lockQuizForGrouping(executor: DbExecutor, quizId: string): Promise<void> {
  const [quiz] = await executor
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(eq(quizzes.id, quizId))
    .for('no key update');

  if (!quiz) {
    throw new Error(`Quiz ${quizId} not found while locking its grouping`);
  }
}
