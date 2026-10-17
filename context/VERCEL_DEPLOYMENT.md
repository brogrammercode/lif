# Vercel deployment

## Projects

Import this repository as **two separate Vercel projects**:

| Project | Root directory | Preset | Node | Build | Output |
| --- | --- | --- | --- | --- | --- |
| API | `apps/api/v2` | NestJS | 24.x | `npm run build` | Managed by NestJS preset |
| Admin | `apps/admin/v1` | Vite | 24.x | `npm run build` | `dist` |

Both roots have `vercel.json`, an npm lockfile and `npm ci` installation. Gym's configurations were reviewed. API V2 uses Vercel's native NestJS support and existing `src/main.ts`, adapting Gym's single-entry API approach. Admin uses Gym's SPA fallback pattern and preserves the local Google popup header.

The API install command is `npm ci --include=dev`: Nest CLI, TypeScript and Prisma CLI are build dependencies. This explicitly includes them even with `NODE_ENV=production` or an npm omit setting. Keep the API Root Directory set to `apps/api/v2` so Vercel reads this configuration. If a previous deployment failed with `nest: command not found`, redeploy the updated commit without the old build cache. [npm include behavior](https://docs.npmjs.com/cli/v11/commands/npm-ci/#include).

`src/main.ts` creates the Nest application with a direct `@nestjs/core` import, then applies the shared configuration from `bootstrap.ts`. This import also survives compilation into `dist/src/main.js`. Vercel's Nest builder checks the entry file itself for that import; delegating all Nest creation to another module caused `No entrypoint found which imports nestjs`. The existing `create_application` helper uses the same configuration for other callers. [Nest builder source](https://github.com/vercel/vercel/blob/main/packages/nestjs/src/build.ts).

API V2 runs as native ES modules: `package.json` declares `type: module` and TypeScript uses `module: NodeNext` with `moduleResolution: NodeNext`. Installed NestJS 12 packages are ES modules; compiling API imports to CommonJS `require()` caused `ERR_REQUIRE_ESM` in Vercel's runtime. Keep the package type and compiler settings aligned, retain relative `.js` import extensions, and preload the existing unit-test environment with Node's `--import` option. [TypeScript NodeNext module rules](https://www.typescriptlang.org/docs/handbook/modules/reference.html#node16-node18-node20-nodenext).

## API environment and Prisma

Configure the API project's Production/Preview environment:

No `.env` file is required or loaded on Vercel. API runtime and Prisma use the variables provided by the hosting process. Local `.env` loading is optional and only enabled outside production/Vercel.

- `NODE_ENV=production`, `DB_STRING` pointing to the intended reachable PostgreSQL database.
- Private `JWT_SECRET` (at least 32 characters) and real `PAYMENT_WEBHOOK_SECRET`.
- `GOOGLE_WEB_CLIENT_ID` and, where applicable, `GOOGLE_CLIENT_ID`.
- `ADMIN_WEB_ORIGIN`: exact admin HTTPS origin(s), comma-separated. Add preview origins explicitly when needed.
- `CORS_ORIGIN`: intended frontend origins.
- Cloudinary cloud name, API key and API secret for uploads.
- Other optional values from `.env.example`. `TRUSTED_PROXY_CIDRS` is an explicit proxy peer allowlist, empty by default.

### Fix the example-secret startup error

If logs say `Configure a private JWT signing secret in production` or `Configure a private payment webhook secret in production`, the deployment has public example values (or the development webhook default), not a missing `.env` file. In the **API project's Settings > Environment Variables**, replace `JWT_SECRET` and `PAYMENT_WEBHOOK_SECRET` in every environment you deploy (Production and Preview as applicable). Do not put these secrets in `vercel.json` or source control.

Generate a private JWT value locally and paste it directly into Vercel, without sharing it in chat:

```powershell
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(48).toString('hex'))"
```

Set `PAYMENT_WEBHOOK_SECRET` to the actual secret shared with the service signing payment callbacks. If that integration is yours, generate a separate value with the same command and configure it on both ends. Keep both values persistent; do not generate them at application startup. After changing Vercel variables, create a new deployment; existing deployments retain their previous configuration. [Vercel environment variables](https://vercel.com/docs/environment-variables).

The requested API build runs:

```text
prisma generate && prisma db push --skip-generate && nest build
```

It generates the client, synchronizes the schema, then compiles. Failures stop the build; there is no reset or `--accept-data-loss` flag. `build:compile` compiles without generation/database writes. `prisma:push` runs the schema step separately.

`db push` does not execute migration SQL, backfills or seed data. Existing V2 migrations remain available. Provision a fresh database with `prisma:deploy` first if it needs the project's existing category seeds/backfills. Do not run the development seed in production; it creates example accounts. Use `admin:grant -- --email <approved-google-email>` with the production database configuration when initial administrator provisioning is needed.

Preview builds also run schema synchronization; give them their intended isolated database. No secret or live `.env` file is committed.

## Admin environment and API routing

Set in the **Admin project's** Vercel environment:

```dotenv
VITE_API_BASE_URL=/api/v2
VITE_GOOGLE_CLIENT_ID=<same-web-client-id-as-the-api>
```

The API project's confirmed domain is `https://apionemore.vercel.app`. Admin's `vercel.json` rewrites `/api/:path*` to `https://apionemore.vercel.app/api/:path*`, before the SPA fallback. Update that destination if the API domain changes. Preview admin deployments use this same backend unless you configure a separate rewrite destination.

The platform rewrite retains the API path and proxies requests to the backend without browser redirects. Local Vite development keeps its existing proxy.

The browser calls `/api/v2` on the admin domain, preserving the Secure, HttpOnly, SameSite=Strict refresh cookie flow. Align API `ADMIN_WEB_ORIGIN` and Google's authorized JavaScript origins with the real admin origin. An absolute cross-site browser API URL is not a replacement for this rewrite.

The API uses `@vercel/functions` `waitUntil` for post-response audit writes. Audit completion is registered before the response so the invocation can stay alive until it settles. Function timeout/database failures can still leave a pending audit record.

## Limits and checks

Vercel's 4.5 MB Function request cap is lower than the largest current 5 MB image encoded in JSON/base64. Use smaller files (about 3 MB or less before base64) for uploads on this deployment. Increasing Nest's body limit cannot bypass the platform cap; supporting the full existing input limit requires a separate upload/compression change.

Preparation checks: API TypeScript/Nest compilation and Prisma validation, admin TypeScript/Vite compilation, formatting and Git whitespace. The database-mutating build pipeline is configured but not run locally for this task. No automated tests or live Vercel deployment are performed.

References: [NestJS](https://vercel.com/docs/frameworks/backend/nestjs), [Vite SPA routing](https://vercel.com/docs/frameworks/frontend/vite), [rewrites](https://vercel.com/docs/routing/rewrites), [background tasks](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package), [Prisma db push](https://www.prisma.io/docs/cli/db/push), [Function limits](https://vercel.com/docs/functions/limitations).
