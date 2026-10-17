import { PrismaClient, Prisma } from '@prisma/client';
import { DATABASE_TRANSACTION_OPTIONS } from '../../core/constants.js';

let last_entity_id = 0;
const create_entity_id = (): string => {
  last_entity_id = Math.max(Date.now(), last_entity_id + 1);
  return last_entity_id.toString();
};

const prisma_base = new PrismaClient({
  transactionOptions: DATABASE_TRANSACTION_OPTIONS,
});

export const prisma = prisma_base.$extends(
  Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async create({ args, query }) {
            const data = args.data as Record<string, unknown>;
            if (!data.id) {
              data.id = create_entity_id();
            }
            return query(args);
          },
          async createMany({ args, query }) {
            const records = Array.isArray(args.data) ? args.data : [args.data];
            for (const record of records) {
              const data = record as Record<string, unknown>;
              if (!data.id) {
                data.id = create_entity_id();
              }
            }
            return query(args);
          },
        },
      },
    }),
  ),
);

export type AppPrismaClient = typeof prisma;
export type TransactionClient = Omit<
  AppPrismaClient,
  '$extends' | '$transaction' | '$connect' | '$disconnect' | '$on' | '$use'
>;

export const disconnect_database = async (): Promise<void> => {
  await prisma.$disconnect();
};
