import { OAuth2Client } from 'google-auth-library';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';

const google_client = new OAuth2Client();

export const verify_google_identity = async (id_token: string) => {
  if (!config.GOOGLE_CLIENT_ID) throw new AppError(503, 'GOOGLE_AUTH_NOT_CONFIGURED', 'Google sign-in is not configured');
  try {
    const ticket = await google_client.verifyIdToken({ idToken: id_token, audience: config.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email_verified) throw new Error('Verified Google account details are missing');
    const [first_name, ...last_name_parts] = (payload.name ?? '').trim().split(/\s+/).filter(Boolean);
    return {
      provider_account_id: payload.sub,
      provider_email: payload.email,
      first_name,
      last_name: last_name_parts.join(' ') || undefined,
      avatar_url: payload.picture,
    };
  } catch {
    throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in could not be verified');
  }
};
