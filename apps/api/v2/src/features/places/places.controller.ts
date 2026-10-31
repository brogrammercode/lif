import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../../core/guards.js';
import { send_success } from '../../core/response.js';
import { PlacesService } from './places.service.js';
import {
  place_id,
  place_input,
  place_update,
  place_list,
  place_toggle,
  place_review,
  place_photo,
} from './places.type.js';
@Controller('places')
@UseGuards(AuthGuard)
export class PlacesController {
  constructor(private readonly service: PlacesService) {}
  @Delete(':id/photos/:photo_id')
  async remove_photo(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('photo_id') photo_id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.remove_photo(
        req.auth!.user_id,
        place_id.parse(id),
        place_id.parse(photo_id),
      ),
      'Photo removed',
    );
  }
  @Get()
  async list(
    @Req() req: Request,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.list(req.auth!.user_id, place_list.parse(query)),
      'Shared places loaded',
    );
  }
  @Get(':id')
  async detail(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.detail(req.auth!.user_id, place_id.parse(id)),
      'Place loaded',
    );
  }
  @Get(':id/reviews')
  async reviews(
    @Param('id') id: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { page } = z
      .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
      .strict()
      .parse(query);
    return send_success(
      res,
      await this.service.reviews(place_id.parse(id), page),
      'Place reviews loaded',
    );
  }
  @Post()
  @HttpCode(200)
  async create(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.create(req.auth!.user_id, place_input.parse(body)),
      'Shared place saved',
    );
  }
  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.update(
        req.auth!.user_id,
        place_id.parse(id),
        place_update.parse(body),
      ),
      'Place updated',
    );
  }
  @Put(':id/bookmark')
  async bookmark(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.bookmark(
        req.auth!.user_id,
        place_id.parse(id),
        place_toggle.parse(body).value,
      ),
      'Saved places updated',
    );
  }
  @Put(':id/visit')
  async visit(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.visit(
        req.auth!.user_id,
        place_id.parse(id),
        place_toggle.parse(body).value,
      ),
      'Visit updated',
    );
  }
  @Put(':id/review')
  async review(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.review(
        req.auth!.user_id,
        place_id.parse(id),
        place_review.parse(body),
      ),
      'Review saved',
    );
  }
  @Delete(':id/review')
  async remove_review(
    @Req() req: Request,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.review(req.auth!.user_id, place_id.parse(id), null),
      'Review removed',
    );
  }
  @Post(':id/photos')
  @HttpCode(200)
  async photo(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    return send_success(
      res,
      await this.service.photo(
        req.auth!.user_id,
        place_id.parse(id),
        place_photo.parse(body),
      ),
      'Photo saved',
    );
  }
}
