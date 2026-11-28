import { Injectable } from '@nestjs/common';
import { AppError } from '../../core/error.js';
import { NOT_FOUND_ERROR_MESSAGE } from '../../core/constants.js';
import {
  TravelContextRepository,
  type RiderSection,
} from './travel-context.repository.js';
import type { RiderHistoryFilters } from './dto/ride-history.dto.js';

@Injectable()
export class TravelContextService {
  constructor(private readonly repository: TravelContextRepository) {}

  async context(userId: string) {
    const user = await this.repository.context(userId);
    if (!user) throw new AppError(404, 'NOT_FOUND', NOT_FOUND_ERROR_MESSAGE);
    const driverAccess =
      (!user.partner_status || user.partner_status === 'ACTIVATED') &&
      (user.role === 'DRIVER' || !!user.partner_activated_at);
    return {
      can_enter_driver_mode: driverAccess,
      driver_operations_allowed: driverAccess,
      driver_availability: user.availability,
      active_rider_ride: user.rider_ride,
      active_driver_ride: user.driver_ride,
      mode_switch_allowed: !user.rider_ride && !user.driver_ride,
    };
  }

  current(userId: string) {
    return this.repository.current(userId);
  }

  rider_history(
    userId: string,
    page: number,
    pageSize: number,
    section: RiderSection,
    filters: RiderHistoryFilters = { query: '' },
  ) {
    return this.repository.rider_history(
      userId,
      page,
      pageSize,
      section,
      filters,
    );
  }

  list(userId: string, page: number, pageSize: number) {
    return this.repository.list(userId, page, pageSize);
  }

  async detail(userId: string, id: string) {
    const ride = await this.repository.detail(userId, id);
    if (!ride)
      throw new AppError(
        404,
        'DRIVER_RIDE_NOT_FOUND',
        'This ride is not assigned to your driver account.',
      );
    return ride;
  }
}
