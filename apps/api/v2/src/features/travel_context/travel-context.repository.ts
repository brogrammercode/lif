import { Injectable } from '@nestjs/common';
import { PostgresService } from '../../database/postgres.service.js';
import type { RiderHistoryFilters } from './dto/ride-history.dto.js';
import { riderActiveStatuses, travelSql } from './sql/travel-context.sql.js';

type Summary = {
  id: string;
  status: string;
  pickup_address: string;
  dropoff_address: string;
  requested_at: string | null;
  created_at: string;
};

export type RiderSection =
  'all' | 'active' | 'past' | 'completed' | 'cancelled' | 'unfulfilled';

@Injectable()
export class TravelContextRepository {
  constructor(private readonly db: PostgresService) {}

  async context(userId: string) {
    const { rows } = await this.db.query<{
      role: string;
      partner_activated_at: Date | null;
      partner_status: string | null;
      availability: string | null;
      rider_ride: Summary | null;
      driver_ride: Summary | null;
    }>(travelSql.context, [userId]);
    return rows[0];
  }

  async current(userId: string) {
    const { rows } = await this.db.query(travelSql.driverCurrent, [userId]);
    return rows[0] ?? null;
  }

  async detail(userId: string, id: string) {
    const { rows } = await this.db.query(travelSql.driverDetail, [userId, id]);
    return rows[0] ?? null;
  }

  list(userId: string, page: number, pageSize: number) {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query(travelSql.driverList, [
        userId,
        pageSize,
        (page - 1) * pageSize,
      ]);
      const { rows: totals } = await tx.query<{ total: number }>(
        travelSql.driverTotal,
        [userId],
      );
      return { rows, total: totals[0]!.total, page, page_size: pageSize };
    }, 'REPEATABLE READ');
  }

  rider_history(
    userId: string,
    page: number,
    pageSize: number,
    section: RiderSection,
    filters: RiderHistoryFilters,
  ) {
    let monthStart: Date | null = null;
    let monthEnd: Date | null = null;
    if (filters.month) {
      const [year, month] = filters.month.split('-').map(Number);
      const istOffset = 330 * 60000;
      monthStart = new Date(Date.UTC(year!, month! - 1, 1) - istOffset);
      monthEnd = new Date(Date.UTC(year!, month!, 1) - istOffset);
    }
    const scope = [
      userId,
      filters.query.replace(/^#?(?:TRP-|TR-)/i, ''),
      filters.query,
      filters.category_id,
      monthStart,
      monthEnd,
    ];
    return this.db.transaction(async (tx) => {
      const { rows: groups } = await tx.query<{
        status: string;
        total: number;
      }>(travelSql.riderCounts, scope);
      const count = (statuses?: readonly string[]) =>
        groups.reduce(
          (total, item) =>
            total +
            (!statuses || statuses.includes(item.status) ? item.total : 0),
          0,
        );
      const statuses = {
        all: undefined,
        active: riderActiveStatuses,
        past: groups
          .map(({ status }) => status)
          .filter((status) => !riderActiveStatuses.includes(status)),
        completed: ['COMPLETED'],
        cancelled: ['CANCELLED'],
        unfulfilled: ['NO_DRIVER_FOUND', 'EXPIRED'],
      };
      const { rows } = await tx.query(travelSql.riderList, [
        ...scope,
        statuses[section],
        pageSize,
        (page - 1) * pageSize,
      ]);
      return {
        rows,
        total: count(statuses[section]),
        page,
        page_size: pageSize,
        counts: {
          all: count(),
          active: count(statuses.active),
          completed: count(statuses.completed),
          cancelled: count(statuses.cancelled),
          unfulfilled: count(statuses.unfulfilled),
          past: count(statuses.past),
        },
      };
    }, 'REPEATABLE READ');
  }
}
