import { Injectable } from '@nestjs/common';
import { VehicleCatalogRepository } from './vehicle_catalog.repo.js';
import { CloudinaryService } from '../../infra/media/cloudinary.js';
import type { BrandInput, ModelInput } from './vehicle_catalog.type.js';
@Injectable()
export class VehicleCatalogService {
  constructor(
    private readonly repo: VehicleCatalogRepository,
    private readonly media: CloudinaryService,
  ) {}
  save_brand(
    actor_id: string,
    input: BrandInput,
    id?: string,
    request = false,
  ) {
    return this.media.with_uploaded_image(
      input.image_upload,
      'vehicle-brands',
      (url) =>
        this.repo.save_brand(
          actor_id,
          { ...input, logo_url: url ?? input.logo_url },
          id,
          request,
        ),
    );
  }
  save_model(
    actor_id: string,
    input: ModelInput,
    id?: string,
    request = false,
  ) {
    return this.media.with_uploaded_image(
      input.image_upload,
      'vehicle-models',
      (url) =>
        this.repo.save_model(
          actor_id,
          { ...input, logo_url: url ?? input.logo_url },
          id,
          request,
        ),
    );
  }
}
