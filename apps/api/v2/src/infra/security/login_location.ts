import { BlockList, isIP } from 'node:net';
import { z } from 'zod';
import {
  GEOCODE_BASE_URL,
  GEOCODE_USER_AGENT,
} from '../../features/geocode/geocode.constant.js';

export const browser_location_schema = z
  .object({
    permission: z.enum(['granted', 'denied', 'unavailable', 'timeout']),
    latitude: z.number().finite().min(-90).max(90).optional(),
    longitude: z.number().finite().min(-180).max(180).optional(),
    accuracy_m: z.number().finite().min(0).max(10000000).optional(),
    public_ip: z
      .string()
      .max(45)
      .refine((value) => isIP(value) !== 0)
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.permission !== 'granted' ||
      (value.latitude !== undefined && value.longitude !== undefined),
    'Granted location requires latitude and longitude.',
  );
export type BrowserLocation = z.infer<typeof browser_location_schema>;
export const login_location_schema = z.object({
  source: z.enum(['BROWSER', 'IP', 'UNAVAILABLE']),
  permission: z.enum(['granted', 'denied', 'unavailable', 'timeout']),
  recorded_at: z.iso.datetime(),
  ip_address: z.string().nullable(),
  ip_origin: z.enum(['REQUEST', 'BROWSER_REPORTED']).nullable(),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  accuracy_m: z.number().finite().nonnegative().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  country: z.string().nullable(),
  isp: z.string().nullable(),
});
export type LoginLocation = z.infer<typeof login_location_schema>;

const private_addresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  private_addresses.addSubnet(network, prefix, 'ipv4');
const public_v6 = new BlockList();
public_v6.addSubnet('2000::', 3, 'ipv6');
private_addresses.addSubnet('2001:db8::', 32, 'ipv6');
function public_ip(value?: string) {
  const ip = value?.replace(/^::ffff:/i, '');
  if (!ip) return null;
  const version = isIP(ip);
  if (version === 4 && !private_addresses.check(ip, 'ipv4')) return ip;
  if (
    version === 6 &&
    public_v6.check(ip, 'ipv6') &&
    !private_addresses.check(ip, 'ipv6')
  )
    return ip;
  return null;
}
const text = z.string().max(300).nullish();
const ip_result_schema = z.object({
  success: z.literal(true),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  city: text,
  region: text,
  country: text,
  connection: z.object({ isp: text }).optional(),
});
const place_schema = z.object({
  address: z.object({
    city: text,
    town: text,
    village: text,
    county: text,
    state: text,
    country: text,
  }),
});
async function lookup(url: URL) {
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': GEOCODE_USER_AGENT },
    signal: AbortSignal.timeout(3000),
    redirect: 'error',
  });
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

export async function resolve_login_location(
  ip?: string,
  browser?: BrowserLocation,
): Promise<LoginLocation> {
  const request_ip = public_ip(ip);
  const reported_ip = request_ip ? null : public_ip(browser?.public_ip);
  const address = request_ip ?? reported_ip;
  const location: LoginLocation = {
    source: 'UNAVAILABLE',
    permission: browser?.permission ?? 'unavailable',
    recorded_at: new Date().toISOString(),
    ip_address: address ?? ip ?? null,
    ip_origin: request_ip ? 'REQUEST' : reported_ip ? 'BROWSER_REPORTED' : null,
    latitude: null,
    longitude: null,
    accuracy_m: null,
    city: null,
    region: null,
    country: null,
    isp: null,
  };
  if (
    browser?.permission === 'granted' &&
    browser.latitude !== undefined &&
    browser.longitude !== undefined
  ) {
    Object.assign(location, {
      source: 'BROWSER',
      latitude: browser.latitude,
      longitude: browser.longitude,
      accuracy_m: browser.accuracy_m ?? null,
    });
    try {
      const url = new URL('/reverse', GEOCODE_BASE_URL);
      url.search = new URLSearchParams({
        lat: String(browser.latitude),
        lon: String(browser.longitude),
        format: 'jsonv2',
        addressdetails: '1',
        zoom: '10',
      }).toString();
      const result = place_schema.safeParse(await lookup(url));
      if (result.success) {
        const place = result.data.address;
        Object.assign(location, {
          city:
            place.city ?? place.town ?? place.village ?? place.county ?? null,
          region: place.state ?? null,
          country: place.country ?? null,
        });
      }
    } catch {
      /* Browser coordinates remain useful if place-name lookup is unavailable. */
    }
    return location;
  }
  if (address) {
    try {
      const result = ip_result_schema.safeParse(
        await lookup(
          new URL(`https://ipwho.is/${encodeURIComponent(address)}`),
        ),
      );
      if (result.success)
        Object.assign(location, {
          source: 'IP',
          latitude: result.data.latitude,
          longitude: result.data.longitude,
          city: result.data.city || null,
          region: result.data.region || null,
          country: result.data.country || null,
          isp: result.data.connection?.isp || null,
        });
    } catch {
      /* Provider outages and quotas must not prevent sign-in. */
    }
  }
  return location;
}

export function read_login_location(value: unknown): LoginLocation | null {
  const result = z
    .object({ login_location: login_location_schema })
    .safeParse(value);
  return result.success ? result.data.login_location : null;
}
