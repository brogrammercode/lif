import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../infra/database/prisma.service.js';
import { AppError } from '../../core/error.js';
import { VehicleCatalogRepository } from './vehicle_catalog.repo.js';
import { brand_input, model_input } from './vehicle_catalog.type.js';

export const catalog_import_input = z
  .object({
    kind: z.enum(['brands', 'models']),
    rows: z
      .array(
        z
          .object({
            row: z.number().int().min(2).max(1000000),
            values: z.record(z.string().max(100), z.string().max(2000)),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (new Set(input.rows.map((row) => row.row)).size !== input.rows.length)
      ctx.addIssue({
        code: 'custom',
        path: ['rows'],
        message: 'CSV source row numbers must be unique within each batch.',
      });
  });
const normalize = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();
const nullable = (value?: string) => value?.trim() || null;
const number = (value?: string) => (value?.trim() ? Number(value) : null);

@Injectable()
export class CatalogImportService {
  constructor(
    private readonly database: PrismaService,
    private readonly repo: VehicleCatalogRepository,
  ) {}
  async import(actor_id: string, input: z.infer<typeof catalog_import_input>) {
    const results: {
      row: number;
      name: string;
      status: 'CREATED' | 'SKIPPED' | 'FAILED';
      message: string;
    }[] = [];
    for (const { row, values: v } of input.rows) {
      try {
        const allowed =
          input.kind === 'brands'
            ? ['name', 'description', 'country', 'website_url']
            : [
                'brand_name',
                'name',
                'description',
                'vehicle_type',
                'fuel_type',
                'seating_capacity',
                'year_from',
                'year_to',
              ];
        if (Object.keys(v).some((key) => !allowed.includes(key)))
          throw new AppError(
            422,
            'CSV_COLUMN_INVALID',
            'Unknown columns. Use the vehicle catalog CSV template.',
          );
        if (input.kind === 'models') {
          if (
            !/^\d+$/.test(v.seating_capacity?.trim() ?? '') ||
            ['year_from', 'year_to'].some(
              (key) => v[key]?.trim() && !/^\d{4}$/.test(v[key]!.trim()),
            )
          )
            throw new AppError(
              422,
              'CSV_NUMBER_INVALID',
              'Use whole decimal numbers for seats and four-digit years.',
            );
          if (
            number(v.year_from) !== null &&
            number(v.year_to) !== null &&
            number(v.year_to)! < number(v.year_from)!
          )
            throw new AppError(
              422,
              'YEAR_RANGE_INVALID',
              'year_to must be at least year_from.',
            );
        }
        const shared = {
          name: v.name ?? '',
          description: nullable(v.description),
        };
        if (input.kind === 'brands') {
          const data = brand_input.parse({
            ...shared,
            country: nullable(v.country),
            website_url: nullable(v.website_url),
          });
          if (
            await this.database.client.vehicleBrand.findUnique({
              where: { normalized_name: normalize(data.name) },
              select: { id: true },
            })
          ) {
            results.push({
              row,
              name: data.name,
              status: 'SKIPPED',
              message: 'Brand already exists; existing data preserved.',
            });
            continue;
          }
          await this.repo.save_brand(actor_id, data);
        } else {
          const brand = await this.database.client.vehicleBrand.findUnique({
            where: { normalized_name: normalize(v.brand_name ?? '') },
            select: { id: true, status: true, is_active: true },
          });
          if (!brand || brand.status !== 'VERIFIED' || !brand.is_active)
            throw new AppError(
              422,
              'BRAND_UNAVAILABLE',
              'Import or verify an active brand with this name first.',
            );
          const data = model_input.parse({
            ...shared,
            brand_id: brand.id,
            vehicle_type: v.vehicle_type?.toUpperCase(),
            fuel_type: v.fuel_type?.toUpperCase(),
            seating_capacity: number(v.seating_capacity),
            year_from: number(v.year_from),
            year_to: number(v.year_to),
          });
          if (
            await this.database.client.vehicleModel.findUnique({
              where: {
                brand_id_normalized_name: {
                  brand_id: brand.id,
                  normalized_name: normalize(data.name),
                },
              },
              select: { id: true },
            })
          ) {
            results.push({
              row,
              name: data.name,
              status: 'SKIPPED',
              message:
                'Model already exists in this brand; existing data preserved.',
            });
            continue;
          }
          await this.repo.save_model(actor_id, data);
        }
        results.push({
          row,
          name: v.name ?? '',
          status: 'CREATED',
          message: 'Created and verified.',
        });
      } catch (error) {
        // End immediately if access was revoked during an import.
        if (error instanceof AppError && [401, 403].includes(error.status_code))
          throw error;
        const duplicate =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        results.push({
          row,
          name: v.name ?? '',
          status: duplicate ? 'SKIPPED' : 'FAILED',
          message: duplicate
            ? 'Already exists; existing data preserved.'
            : error instanceof z.ZodError
              ? error.issues
                  .map((i) => `${i.path.join('.')}: ${i.message}`)
                  .join('; ')
              : error instanceof AppError
                ? error.message
                : 'Could not save this row. Retry the import; existing rows will be skipped.',
        });
      }
    }
    return {
      results,
      created: results.filter((r) => r.status === 'CREATED').length,
      skipped: results.filter((r) => r.status === 'SKIPPED').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
    };
  }
}
