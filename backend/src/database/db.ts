import { prisma } from '../config/prisma';
import { Prisma } from '@prisma/client';

export type TransactionClient = Omit<
  Prisma.TransactionClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

/**
 * Reusable transaction helper to enforce atomic operations across multiple tables.
 * @param callback The function to execute within the transaction
 * @param options Transaction options (timeout, isolation level)
 * @returns The result of the callback
 */
export const runInTransaction = async <T>(
  callback: (tx: TransactionClient) => Promise<T>,
  options?: {
    maxWait?: number;
    timeout?: number;
    isolationLevel?: Prisma.TransactionIsolationLevel;
  }
): Promise<T> => {
  return await prisma.$transaction(callback, options);
};

export { prisma };
