import { OAuth2Client } from 'google-auth-library';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';

const google_client = new OAuth2Client();

export const verify_google_identity = async (
  id_token: string,
  audience = config.GOOGLE_CLIENT_ID,
) => {
  if (!audience)
    throw new AppError(
      503,
      'GOOGLE_AUTH_NOT_CONFIGURED',
      'Google sign-in is not configured',
    );
  try {
    const ticket = await google_client.verifyIdToken({
      idToken: id_token,
      audience,
    });
    const payload = ticket.getPayload();
    const email = payload?.email?.trim().toLowerCase();
    if (!payload?.sub || payload.email_verified !== true || !email)
      throw new Error('Verified Google account details are missing');
    const [first_name, ...last_name_parts] = (payload.name ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return {
      provider_account_id: payload.sub,
      provider_email: email,
      first_name,
      last_name: last_name_parts.join(' ') || undefined,
      avatar_url: payload.picture,
    };
  } catch {
    throw new AppError(
      401,
      'GOOGLE_TOKEN_INVALID',
      'Google sign-in could not be verified',
    );
  }
};
