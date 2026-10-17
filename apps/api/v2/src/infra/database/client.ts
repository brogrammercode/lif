import { PrismaClient, Prisma } from '@prisma/client';
import { DATABASE_TRANSACTION_OPTIONS } from '../../core/constants.js';
import { prepare_entity_data } from './entity_id.js';
import { config } from '../../core/config.js';
import { database_connection_url } from './connection_url.js';
const prisma_base = new PrismaClient({
  datasourceUrl: database_connection_url(config.DB_STRING),
  transactionOptions: DATABASE_TRANSACTION_OPTIONS,
});
export const prisma = prisma_base.$extends(
  Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async create({ model, args, query }) {
            prepare_entity_data(model, args.data, true);
            return query(args);
          },
          async createMany({ model, args, query }) {
            prepare_entity_data(model, args.data, true);
            return query(args);
          },
          async upsert({ model, args, query }) {
            prepare_entity_data(model, args.create, true);
            prepare_entity_data(model, args.update, false);
            return query(args);
          },
          async createManyAndReturn({ model, args, query }) {
            prepare_entity_data(model, args.data, true);
            return query(args);
          },
          async update({ model, args, query }) {
            prepare_entity_data(model, args.data, false);
            return query(args);
          },
          async updateMany({ model, args, query }) {
            prepare_entity_data(model, args.data, false);
            return query(args);
          },
          async updateManyAndReturn({ model, args, query }) {
            prepare_entity_data(model, args.data, false);
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
