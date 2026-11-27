# API v2 daily cron

- [x] Configure one Vercel trigger at 05:00 IST (`30 23 * * *` UTC).
- [x] Protect `GET /api/v2/internal/cron` with `Authorization: Bearer <CRON_SECRET>`. The controller triggers the dispatcher, which calls the existing service methods.
- [x] Run seven-day audit cleanup, payout cycle preparation, payout transfers and top-up reconciliation. Audit and top-ups run alongside the payout branch. Transfers follow the cycle check. A failing job is logged without cancelling the others.
- [x] Remove both old cron routes and all automatic audit timers. Emails and Razorpay webhooks still respond to their own events.
- [x] Pass API compilation, admin build and 56 focused API tests covering auth, dispatch, failure isolation and the single schedule.

The Payout settings dialog accepts a cadence and optional next date. A chosen date starts the recurring cadence at the 05:00 IST check. With just a cadence change, the API uses the most recent cycle cutoff and picks the next daily check if already overdue. The worker checks the last recorded cycle before drafting. Existing timing options sent by older clients still work. A run starts up to 10 due cycles, 10 payout batches of 3 and 40 top-up checks, stopping between batches when the 40-second processing window is reached. Remaining work is eligible at the next run.

For every new scheduled task, add a service method and register it in `CronJobs.run()`. The existing daily route remains the only scheduler entry point.

Production verification is pending deployment. Set `CRON_SECRET` in the Vercel API project if missing. The 05:00 IST schedule uses Vercel Hobby's hourly delivery precision. [Vercel cron timing](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
