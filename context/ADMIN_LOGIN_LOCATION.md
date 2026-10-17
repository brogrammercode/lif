# Admin login location and category lock correction

## Category write failure

Prisma binds interpolated JavaScript integers as PostgreSQL bigint parameters. The two-argument advisory-lock overload takes `(integer, integer)`, while the one-argument overload takes `bigint`. The lifecycle namespace parameter was used with `hashtext(...)`, an integer, producing the missing `(bigint, integer)` signature and error 42883/P2010.

V2's shared lifecycle lock and the matching exclusive deactivation lock now explicitly cast the namespace to `integer`. Both sides retain the same namespace/key, lock order and protection. Existing SQL integer literals paired with `hashtext` already have the correct types. The one-key access locks remain unchanged.

Source: [PostgreSQL advisory-lock signatures](https://www.postgresql.org/docs/15/functions-admin.html).

## New sign-in location flow

1. After Google returns a credential, the admin browser requests native geolocation permission. The login screen explains the recording and fallback.
2. If granted, browser latitude, longitude and reported accuracy are sent with the sign-in. The API attempts a city/region/country lookup through the existing Nominatim provider; coordinates remain available if that lookup fails.
3. If declined, unsupported, unsuccessful or unanswered, the browser attempts a bounded public-IP discovery request to ipify. This supports local development where the API only sees a loopback proxy address.
4. The API prefers a public IP observed on the request. If it only sees a local/private address, it may use the browser-reported public IP, explicitly recording that origin. Private/reserved addresses are not sent for external IP geolocation.
5. The API performs a bounded HTTPS IP geolocation lookup with ipwho.is for city/region/country, coordinates and ISP. It does not substitute the API server's own location for the browser's location.
6. The derived snapshot is committed in the existing transactional `ADMIN_SIGN_IN` UserLog event. There is no schema migration. Each real sign-in gets its own snapshot; refresh does not change the last sign-in location.

The browser permission wait has a 10-second outer deadline, public-IP discovery a 2.5-second deadline, and each server lookup a 3-second deadline. External lookups happen outside database transactions and fail open for authentication. Normal authorization and identity verification still apply. Invalid metadata is rejected by the request schema; provider response values are validated before persistence. Tokens, cookies and Google credentials are not sent to location providers.

Geolocation and client-reported public IPs are informational metadata, not verified physical presence and not authorization inputs. IP results describe an approximate network area; VPNs, proxies and ISP routing can affect it. Raw forwarded-IP headers are not trusted automatically. If a production reverse proxy presents a private peer address, the browser-reported fallback is labeled accordingly.

## Admin Access display

The directory selects the latest `ADMIN_SIGN_IN` event for each administrator and displays its location next to Last admin login. Browser locations show source and reported accuracy; IP estimates show their approximate source, ISP when available and IP origin. A map link is labeled **View location** or **View approximate area**. Missing/failed lookups are explicit. Historical events without a snapshot say **Not recorded**; sign out and sign in once to record a new location.

Existing ride/current-user coordinates are not used as login-location evidence. They are separate data with a different purpose.

Provider references: [ipify public IP API](https://www.ipify.org/), [ipwho.is HTTPS endpoint, fields and free-endpoint quotas](https://ipwhois.io/documentation). No API key or paid subscription is configured. Rate-limit/provider failures leave the location unavailable and allow normal sign-in.

For a deployed reverse proxy, set V2 `TRUSTED_PROXY_CIDRS` to its explicit peer IP/CIDR list (comma-separated) and configure the proxy to overwrite/append forwarded headers correctly. The setting is validated and empty by default, leaving forwarded headers untrusted. Avoid broad network allowlists. This lets `request.ip` represent the client through known proxies rather than recording the proxy as the client. Vite forwards client headers for development; loopback/private clients still use the labeled public-IP fallback where appropriate. See [Express proxy trust](https://expressjs.com/en/guide/behind-proxies/).

## Sidebar

The secondary rail is 260px on desktop (previously 208px), and 224px at the intermediate desktop breakpoint (previously 176px). Existing tablet/mobile context navigation and common styling remain in use.

## Checks

API V2 TypeScript check and Nest production build passed. Admin TypeScript/Vite production build passed. Both packages' full formatting checks and the Git whitespace check passed. No automated tests or real Google/browser permission/provider flows were run for this request.
