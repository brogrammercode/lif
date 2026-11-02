# Mobile authentication connectivity repair

Date: 2 November 2026

## Reported failure

Flutter Google sign-in completed its local Google step, then `POST /auth/google` failed with no HTTP status because Dio aborted while trying to establish the API connection after 15 seconds.

This is a transport failure, not an API `401`, Google-token rejection, database error or expired 1More session. No HTTP status means the client did not receive an API response.

## Evidence

- The shared mobile Dio client applied a 15-second socket-connect timeout and 20-second response timeout to every request, including first sign-in and refresh.
- The API's database acquisition path has a separate bounded 30-second allowance. On a cold or constrained path, the mobile authentication request could therefore end earlier than the backend's intended recovery budget.
- A public connectivity probe on 2 November resolved `apionemore.vercel.app`, but TCP/TLS connection establishment failed after about 21 seconds. `vercel.com` failed similarly, while Google Accounts connected in about 0.08 seconds. This isolates the observed environment's failure to its route to Vercel before NestJS, Google verification or Prisma.

The public probe is point-in-time evidence from one network; it does not prove a permanent Vercel outage or that every phone/network has the same route failure.

## Repair

- Keep ordinary API calls on their existing short global timeouts.
- Give only Google sign-in and session refresh a 45-second connection budget, 60-second response budget and 30-second upload budget.
- Add per-request `connectTimeout` support to the centralized Dio wrapper rather than changing every API call.
- Distinguish connection failures from server response delays in user-facing errors. Connection failure now recommends switching between Wi-Fi and mobile data; a receive/send timeout explains that the server connected but is taking longer.
- Do not automatically replay a Google-login POST after an ambiguous network failure. A completed first attempt could already have created a session; blind replay would create extra sessions/audit entries. The user can retry explicitly.

## Operational limitation

Longer application timeouts cannot repair an ISP/firewall route that cannot establish a TCP connection to any Vercel host. If the failure continues on both mobile data and Wi-Fi, verify the deployed API health URL from the affected network and configure a production custom API domain or another reachable hosting route. Do not point the release app at a raw Vercel IP; TLS, routing and deployments require a hostname.

## Verification

- A unit regression verifies authentication can override only its own connect/send/receive timeouts.
- A unit regression verifies connection and response timeout messages remain distinct.
- `flutter analyze` completed with no issues.
- The focused core-network suite completed with 11 passing tests.
- The complete Flutter suite completed with 159 passing tests.

No API contract, token lifetime, Google audience, database schema, native Android/iOS configuration or dependency version changes are part of this repair.
