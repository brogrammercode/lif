import type { Response } from 'express';
export const send_success = <T>(
  response: Response,
  data: T,
  message: string,
  status_code = 200,
) => {
  response.status(status_code);
  return { status: 'success' as const, message, data };
};
