import { opaqueIdSchema } from '../../common/dto/opaque-id.dto.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUserId } from '../../common/decorators/current-user-id.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuthGuard } from '../../core/guards.js';
import { success } from '../../core/response.js';
import { EmergencyService } from './emergency.service.js';
import {
  EMERGENCY_CONTACT_CREATED_MESSAGE,
  EMERGENCY_CONTACT_DELETED_MESSAGE,
  EMERGENCY_CONTACTS_LOADED_MESSAGE,
  EMERGENCY_CONTACT_UPDATED_MESSAGE,
} from './emergency.constant.js';
import {
  emergency_contact_schema,
  type EmergencyContactInput,
} from './dto/emergency-contact.dto.js';

@Controller(['emergency-contacts', 'me/emergency-contacts'])
@UseGuards(AuthGuard)
export class EmergencyController {
  constructor(private readonly emergencyService: EmergencyService) {}

  @Get()
  async list(@CurrentUserId() userId: string) {
    const data = await this.emergencyService.get_emergency_contacts(userId);
    return success(data, EMERGENCY_CONTACTS_LOADED_MESSAGE);
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentUserId() userId: string,
    @Body(new ZodValidationPipe(emergency_contact_schema))
    input: EmergencyContactInput,
  ) {
    const data = await this.emergencyService.add_emergency_contact(
      userId,
      input,
    );
    return success(data, EMERGENCY_CONTACT_CREATED_MESSAGE);
  }

  @Patch(':id')
  async update(
    @CurrentUserId() userId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
    @Body(new ZodValidationPipe(emergency_contact_schema))
    input: EmergencyContactInput,
  ) {
    const data = await this.emergencyService.edit_emergency_contact(
      userId,
      id,
      input,
    );
    return success(data, EMERGENCY_CONTACT_UPDATED_MESSAGE);
  }

  @Delete(':id')
  async remove(
    @CurrentUserId() userId: string,
    @Param('id', new ZodValidationPipe(opaqueIdSchema)) id: string,
  ) {
    await this.emergencyService.remove_emergency_contact(userId, id);
    return success(null, EMERGENCY_CONTACT_DELETED_MESSAGE);
  }
}
