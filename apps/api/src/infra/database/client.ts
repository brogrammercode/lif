import { PrismaClient, Prisma } from '@prisma/client';

const create_entity_id = (): string => Date.now().toString();

const prisma_base = new PrismaClient();

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
export type TransactionClient = any;

export const disconnect_database = async (): Promise<void> => {
  await prisma.$disconnect();
};
