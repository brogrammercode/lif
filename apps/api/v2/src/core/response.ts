import type { Response } from 'express';
export const success = <T>(data: T, message: string) => ({
  status: 'success' as const,
  message,
  data,
});

export const send_success = <T>(
  response: Response,
  data: T,
  message: string,
  status_code = 200,
) => {
  response.status(status_code);
  return success(data, message);
};
