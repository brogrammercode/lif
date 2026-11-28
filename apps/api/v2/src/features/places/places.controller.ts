import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { PlacesService } from './places.service.js';
import {
  place_id,
  place_input,
  place_update,
  place_remove,
  place_list,
  place_toggle,
  place_review,
  place_photo,
} from './places.type.js';

const review_query = z
  .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
  .strict();

@Controller('places')
@UseGuards(AuthGuard)
export class PlacesController {
  constructor(private readonly service: PlacesService) {}

  @Delete(':id/photos/:photo_id')
  async remove_photo(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
    @Param('photo_id', new ZodValidationPipe(place_id)) photoId: string,
  ) {
    return success(
      await this.service.remove_photo(user, id, photoId),
      'Photo removed',
    );
  }

  @Get()
  async list(
    @CurrentUserId() user: string,
    @Query(new ZodValidationPipe(place_list))
    input: z.output<typeof place_list>,
  ) {
    return success(
      await this.service.list(user, input),
      'Shared places loaded',
    );
  }

  @Get(':id')
  async detail(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
  ) {
    return success(await this.service.detail(user, id), 'Place loaded');
  }

  @Get(':id/reviews')
  async reviews(
    @Param('id', new ZodValidationPipe(place_id)) id: string,
    @Query(new ZodValidationPipe(review_query))
    input: z.output<typeof review_query>,
  ) {
    return success(
      await this.service.reviews(id, input.page),
      'Place reviews loaded',
    );
  }

  @Post()
  @HttpCode(200)
  async create(
    @CurrentUserId() user: string,
    @Body(new ZodValidationPipe(place_input))
    input: z.output<typeof place_input>,
  ) {
    return success(
      await this.service.create(user, input),
      'Shared place saved',
    );
  }

  @Patch(':id')
  async update(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
    @Body(new ZodValidationPipe(place_update))
    input: z.output<typeof place_update>,
  ) {
    return success(await this.service.update(user, id, input), 'Place updated');
  }

  @Delete(':id')
  async remove(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
    @Body(new ZodValidationPipe(place_remove))
    input: z.output<typeof place_remove>,
  ) {
    return success(
      await this.service.remove(user, id, input.version),
      'Place removed',
    );
  }

  @Put(':id/bookmark')
  async bookmark(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
    @Body(new ZodValidationPipe(place_toggle))
    input: z.output<typeof place_toggle>,
  ) {
    return success(
      await this.service.bookmark(user, id, input.value),
      'Saved places updated',
    );
  }

  @Put(':id/visit')
  async visit(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
    @Body(new ZodValidationPipe(place_toggle))
    input: z.output<typeof place_toggle>,
  ) {
    return success(
      await this.service.visit(user, id, input.value),
      'Visit updated',
    );
  }

  @Put(':id/review')
  async review(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
    @Body(new ZodValidationPipe(place_review))
    input: z.output<typeof place_review>,
  ) {
    return success(await this.service.review(user, id, input), 'Review saved');
  }

  @Delete(':id/review')
  async remove_review(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
  ) {
    return success(await this.service.review(user, id, null), 'Review removed');
  }

  @Post(':id/photos')
  @HttpCode(200)
  async photo(
    @CurrentUserId() user: string,
    @Param('id', new ZodValidationPipe(place_id)) id: string,
    @Body(new ZodValidationPipe(place_photo))
    input: z.output<typeof place_photo>,
  ) {
    return success(await this.service.photo(user, id, input), 'Photo saved');
  }
}
