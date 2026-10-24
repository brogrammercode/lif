import { z } from 'zod';

export const FARE_GROUPS = ['AUTO_TOTO', 'BIKE_SCOOTER', 'CAR'] as const;
export const FARE_POLICY_LOCK = 720051;
export const SUPPORT_CONFIGURATION_LOCK = 720053;
export const CONFIGURATION_KEY = 'default';

const decimal = (precision: number, maximum: number) =>
  z
    .number()
    .finite()
    .nonnegative()
    .max(maximum)
    .refine(
      (value) =>
        Math.abs(
          value * 10 ** precision - Math.round(value * 10 ** precision),
        ) < 0.00001,
      `Use at most ${precision} decimal places`,
    );
export const fare_policy_input = z
  .object({
    arrival_radius_m: z.number().int().min(20).max(1000).default(150),
    location_max_age_s: z.number().int().min(10).max(180).default(60),
    matching_initial_radius_km: z.number().int().min(1).max(30).default(1),
    matching_max_radius_km: z.number().int().min(1).max(100).default(10),
    matching_expansion_s: z.number().int().min(10).max(120).default(30),
    search_timeout_s: z.number().int().min(60).max(600).default(180),
    offer_lifetime_s: z.number().int().min(15).max(120).default(45),
    expected_version: z.number().int().nonnegative(),
    cash_enabled: z.boolean(),
    direct_upi_enabled: z.boolean(),
    online_payment_enabled: z.literal(false),
    commission_percent: z.literal(0),
    free_cancellation_minutes: z.number().int().min(0).max(60),
    free_pickup_wait_minutes: z.number().int().min(0).max(120),
    cancellation_fee_percent: decimal(2, 100),
    maximum_cancellation_fee: decimal(2, 1000000),
    rates: z
      .array(
        z
          .object({
            group: z.enum(FARE_GROUPS),
            max_profit_km: decimal(3, 100000),
            normal_fare_per_km: decimal(2, 1000000),
            profit_fare_per_km: decimal(2, 1000000),
          })
          .strict(),
      )
      .length(3),
  })
  .strict()
  .refine(
    (value) => new Set(value.rates.map((rate) => rate.group)).size === 3,
    {
      message:
        'Configure exactly one rate for Auto/Toto, Bike/Scooter and Car.',
      path: ['rates'],
    },
  )
  .refine((v) => v.matching_initial_radius_km <= v.matching_max_radius_km, {
    message: 'Maximum search radius must cover the initial radius.',
    path: ['matching_max_radius_km'],
  })
  .refine((value) => value.cash_enabled || value.direct_upi_enabled, {
    message: 'Enable at least one supported payment method.',
    path: ['cash_enabled'],
  });

const optional_phone = z
  .string()
  .trim()
  .pipe(
    z.union([
      z.literal(''),
      z
        .string()
        .trim()
        .regex(/^\+[1-9]\d{7,14}$/, 'Include + and the country code.'),
    ]),
  )
  .nullable();
export const support_contact_input = z
  .object({
    expected_version: z.number().int().nonnegative(),
    support_phone: optional_phone,
    emergency_phone: z
      .string()
      .trim()
      .pipe(
        z.union([
          z.literal(''),
          z
            .string()
            .trim()
            .regex(
              /^\+?[0-9]{3,15}$/,
              'Use a valid short code or international phone number.',
            ),
        ]),
      )
      .nullable(),
    whatsapp_phone: optional_phone,
    support_email: z
      .string()
      .trim()
      .pipe(z.union([z.literal(''), z.email().max(254)]))
      .nullable(),
    support_hours: z.string().trim().max(200).nullable(),
    instructions: z.string().trim().max(2000).nullable(),
  })
  .strict();

export type FarePolicyInput = z.infer<typeof fare_policy_input>;
export type SupportContactInput = z.infer<typeof support_contact_input>;
