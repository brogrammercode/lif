import { Controller, Get, Query } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { GeocodeService } from './geocode.service.js';
import { success } from '../../core/response.js';
import {
  GEOCODE_REVERSE_MESSAGE,
  GEOCODE_SEARCH_MESSAGE,
} from './geocode.constant.js';
import {
  reverse_schema,
  route_schema,
  search_schema,
  type ReverseInput,
  type RouteInput,
  type SearchInput,
} from './dto/geocode.dto.js';
@Controller('geocode')
export class GeocodeController {
  constructor(private readonly geocodeService: GeocodeService) {}
  @Get('search')
  async search(
    @Query(new ZodValidationPipe(search_schema)) input: SearchInput,
  ) {
    return success(
      await this.geocodeService.search_places(input),
      GEOCODE_SEARCH_MESSAGE,
    );
  }

  @Get('reverse')
  async reverse(
    @Query(new ZodValidationPipe(reverse_schema)) input: ReverseInput,
  ) {
    return success(
      await this.geocodeService.reverse_geocode(input),
      GEOCODE_REVERSE_MESSAGE,
    );
  }

  @Get('route')
  async route(@Query(new ZodValidationPipe(route_schema)) input: RouteInput) {
    return success(
      await this.geocodeService.driving_route(input),
      'Driving route loaded',
    );
  }
}
