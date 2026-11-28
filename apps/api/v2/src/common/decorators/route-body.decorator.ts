import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const RouteBody = createParamDecorator(
  (parameter: string, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest<Request>();
    return {
      routeId: request.params[parameter],
      body: request.body as unknown,
    };
  },
);
