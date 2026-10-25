import { waitUntil } from '@vercel/functions';

// A background-runtime/context failure must never change a committed approval
// into an apparent form failure. The durable outbox remains retryable.
export function background_mail(
  task: Promise<unknown>,
  event: string,
  application_id: string,
) {
  const handled = task.catch(() =>
    console.error({
      event,
      application_id,
      message: 'Email job failed. Check delivery status and retry.',
    }),
  );
  try {
    waitUntil(handled);
  } catch {
    console.warn({
      event: 'EMAIL_BACKGROUND_CONTEXT_UNAVAILABLE',
      application_id,
    });
  }
}
