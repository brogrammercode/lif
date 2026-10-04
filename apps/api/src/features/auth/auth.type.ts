import { z } from 'zod';

export const external_login_schema = z.object({
  id_token: z.string().min(1),
});

export const refresh_schema = z.object({
  refresh_token: z.string().min(1),
});

export type GoogleLoginInput = z.infer<typeof external_login_schema>;
export type ExternalLoginInput = {
  provider_account_id: string;
  provider_email?: string;
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
};
export type RefreshInput = z.infer<typeof refresh_schema>;

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  user: Record<string, unknown>;
};
