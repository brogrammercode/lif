import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { prisma } from '../infra/database/client.js';
import { config } from '../core/config.js';
import { AppError } from '../core/error.js';
import { PrismaService } from '../infra/database/prisma.service.js';
import { AdminAccessRepository } from '../features/admin_access/admin_access.repo.js';
import { AdminAuthRepository } from '../features/admin_auth/admin_auth.repo.js';
import { AuthRepository } from '../features/auth/auth.repo.js';
import { AuthService } from '../features/auth/auth.service.js';
const database = new PrismaService();
const { grant_access } = new AdminAccessRepository(database);
const { create_admin_session } = new AdminAuthRepository(database);
const mobileAuth = new AuthService(new AuthRepository(database));
const mobile_login = (
  identity: Parameters<AdminAuthRepository['create_admin_session']>[0],
) => mobileAuth.login_with_provider('GOOGLE', identity, {});

describe(
  'granted admin and mobile account identity',
  {
    skip: process.env.LIF_RUN_DB_TESTS !== '1',
    timeout: 240_000,
  },
  () => {
    const prefix = `access-identity-${randomUUID()}`;
    const ids: string[] = [];
    let actor_id: string;
    const emailFor = (name: string) => `${prefix}-${name}@example.test`;
    const identityFor = (name: string, email = emailFor(name)) => ({
      provider_account_id: `${prefix}-google-${name}`,
      provider_email: email,
      first_name: 'Google',
      last_name: 'Profile',
      avatar_url: 'https://example.test/google-avatar.webp',
    });
    const remember = <T extends { id: string }>(user: T): T => {
      ids.push(user.id);
      return user;
    };
    const grant = async (name: string) => {
      const result = await grant_access(actor_id, { email: emailFor(name) });
      return remember(result.user);
    };
    const assertOneIdentity = async (id: string, email: string) => {
      assert.equal(
        await prisma.user.count({
          where: { email: { equals: email, mode: 'insensitive' } },
        }),
        1,
      );
      const links = await prisma.authAccount.findMany({
        where: { user_id: id, provider: 'GOOGLE' },
      });
      assert.equal(links.length, 1);
      assert.match(links[0]!.id, /^\d+$/);
      assert.equal(
        (await prisma.user.findUniqueOrThrow({ where: { id } })).role,
        'ADMIN',
      );
    };
    before(async () => {
      assert.match(
        new URL(config.DB_STRING).pathname,
        /test/i,
        'Identity checks require a test database',
      );
      const actor = remember(
        await prisma.user.create({
          data: { email: emailFor('actor'), role: 'ADMIN' },
        }),
      );
      actor_id = actor.id;
    });
    after(async () => {
      try {
        if (ids.length)
          await prisma.$transaction(
            async (tx) => {
              await tx.userLog.deleteMany({
                where: {
                  OR: [
                    { actor_id: { in: ids } },
                    { entity_type: 'User', entity_id: { in: ids } },
                  ],
                },
              });
              await tx.user.deleteMany({ where: { id: { in: ids } } });
            },
            { timeout: 30_000 },
          );
      } finally {
        await prisma.$disconnect();
      }
    });

    it('creates a normal user ID on grant, links first admin sign-in, then reuses the same identity on mobile', async () => {
      const provisioned = await grant('admin-first');
      assert.match(provisioned.id, /^\d+$/);
      assert.equal(provisioned.status, 'ACTIVE');
      assert.equal(provisioned.first_name, null);
      assert.equal(
        await prisma.authAccount.count({ where: { user_id: provisioned.id } }),
        0,
      );
      const identity = identityFor('admin-first');
      const browser = await create_admin_session(identity, {});
      assert.equal(browser.user.id, provisioned.id);
      assert.equal(browser.user.first_name, identity.first_name);
      assert.equal(browser.user.last_name, identity.last_name);
      assert.equal(browser.user.avatar_url, identity.avatar_url);
      assert.ok(browser.access_token);
      const mobile = await mobile_login(identity);
      assert.equal(mobile.user.id, provisioned.id);
      assert.equal(mobile.user.role, 'ADMIN');
      assert.ok(mobile.access_token);
      assert.equal(
        await prisma.session.count({
          where: { user_id: provisioned.id, family_id: { not: null } },
        }),
        1,
      );
      assert.equal(
        await prisma.session.count({
          where: { user_id: provisioned.id, family_id: null },
        }),
        1,
      );
      await assertOneIdentity(provisioned.id, identity.provider_email);
      const audit = await prisma.userLog.findFirst({
        where: { entity_id: provisioned.id, action: 'GRANT_ADMIN_ACCESS' },
      });
      assert.ok(audit);
    });

    it('reuses the granted account when mobile sign-in happens before admin sign-in', async () => {
      const provisioned = await grant('mobile-before-admin');
      const identity = identityFor('mobile-before-admin');
      const mobile = await mobile_login(identity);
      const browser = await create_admin_session(identity, {});
      assert.equal(mobile.user.id, provisioned.id);
      assert.equal(browser.user.id, provisioned.id);
      await assertOneIdentity(provisioned.id, identity.provider_email);
    });

    it('promotes an existing mobile account and preserves edited profile data in both apps', async () => {
      const identity = identityFor('existing-rider');
      const original = await mobile_login(identity);
      const id = original.user.id as string;
      ids.push(id);
      await prisma.user.update({
        where: { id },
        data: {
          first_name: 'Saved',
          last_name: 'Name',
          avatar_url: 'https://example.test/saved-avatar.webp',
        },
      });
      const grantResult = await grant_access(actor_id, {
        email: identity.provider_email,
      });
      assert.equal(grantResult.user.id, id);
      assert.equal(
        (await prisma.adminAccess.findUniqueOrThrow({ where: { user_id: id } }))
          .previous_role,
        'RIDER',
      );
      const browser = await create_admin_session(identity, {});
      const mobile = await mobile_login(identity);
      for (const user of [browser.user, mobile.user]) {
        assert.equal(user.id, id);
        assert.equal(user.first_name, 'Saved');
        assert.equal(user.last_name, 'Name');
        assert.equal(user.avatar_url, 'https://example.test/saved-avatar.webp');
      }
      await assertOneIdentity(id, identity.provider_email);
    });

    it('serializes simultaneous first admin/mobile sign-ins without creating a second user or Google link', async () => {
      const user = await grant('concurrent-login');
      const identity = identityFor('concurrent-login');
      const [browser, mobile] = await Promise.all([
        create_admin_session(identity, {}),
        mobile_login(identity),
      ]);
      assert.equal(browser.user.id, user.id);
      assert.equal(mobile.user.id, user.id);
      await assertOneIdentity(user.id, identity.provider_email);
    });

    it('reuses one account when granting access races with first mobile registration', async () => {
      const identity = identityFor('concurrent-grant');
      const outcomes = await Promise.allSettled([
        grant_access(actor_id, { email: identity.provider_email }),
        mobile_login(identity),
      ]);
      const granted = outcomes[0];
      const mobile = outcomes[1];
      if (granted.status === 'fulfilled') remember(granted.value.user);
      if (mobile.status === 'fulfilled')
        ids.push(mobile.value.user.id as string);
      assert.equal(
        granted.status,
        'fulfilled',
        granted.status === 'rejected' ? String(granted.reason) : '',
      );
      assert.equal(
        mobile.status,
        'fulfilled',
        mobile.status === 'rejected' ? String(mobile.reason) : '',
      );
      if (granted.status !== 'fulfilled' || mobile.status !== 'fulfilled')
        return;
      assert.equal(granted.value.user.id, mobile.value.user.id);
      await assertOneIdentity(granted.value.user.id, identity.provider_email);
    });

    it('normalizes email matching and rejects another Google subject after linking', async () => {
      const user = await grant('normalized');
      const identity = identityFor(
        'normalized',
        `  ${emailFor('normalized').toUpperCase()}  `,
      );
      assert.equal((await create_admin_session(identity, {})).user.id, user.id);
      assert.equal((await mobile_login(identity)).user.id, user.id);
      const impostor = {
        ...identity,
        provider_account_id: `${prefix}-different-subject`,
      };
      await assert.rejects(
        create_admin_session(impostor, {}),
        (error: unknown) =>
          error instanceof AppError &&
          error.error_code === 'ADMIN_ACCESS_DENIED',
      );
      await assert.rejects(
        mobile_login(impostor),
        (error: unknown) =>
          error instanceof AppError && error.error_code === 'IDENTITY_CONFLICT',
      );
      await assertOneIdentity(user.id, emailFor('normalized'));
    });

    it('rejects ambiguous case-insensitive email owners in either login path', async () => {
      const email = emailFor('duplicate');
      const first = remember(
        await prisma.user.create({ data: { email, role: 'ADMIN' } }),
      );
      const second = remember(
        await prisma.user.create({
          data: { email: email.toUpperCase(), role: 'ADMIN' },
        }),
      );
      const identity = identityFor('duplicate');
      await assert.rejects(
        create_admin_session(identity, {}),
        (error: unknown) =>
          error instanceof AppError &&
          error.error_code === 'ADMIN_ACCESS_DENIED',
      );
      await assert.rejects(
        mobile_login(identity),
        (error: unknown) =>
          error instanceof AppError && error.error_code === 'IDENTITY_CONFLICT',
      );
      assert.equal(
        await prisma.authAccount.count({
          where: { user_id: { in: [first.id, second.id] } },
        }),
        0,
      );
    });

    it('does not link inactive or soft-deleted provisioned accounts', async () => {
      for (const mode of ['suspended', 'deleted'] as const) {
        const user = await grant(mode);
        await prisma.user.update({
          where: { id: user.id },
          data:
            mode === 'suspended'
              ? { status: 'SUSPENDED' }
              : { deleted_at: new Date() },
        });
        const identity = identityFor(mode);
        await assert.rejects(
          create_admin_session(identity, {}),
          (error: unknown) =>
            error instanceof AppError &&
            error.error_code === 'ADMIN_ACCESS_DENIED',
        );
        await assert.rejects(
          mobile_login(identity),
          (error: unknown) =>
            error instanceof AppError && error.error_code === 'USER_INACTIVE',
        );
        assert.equal(
          await prisma.authAccount.count({ where: { user_id: user.id } }),
          0,
        );
        assert.equal(
          await prisma.session.count({ where: { user_id: user.id } }),
          0,
        );
      }
    });

    it('rejects a bound Google subject whose current email belongs to another granted account', async () => {
      const original = await grant('old-email');
      const identity = identityFor('old-email');
      await create_admin_session(identity, {});
      const other = await grant('new-email');
      const changedIdentity = { ...identity, provider_email: other.email! };
      await assert.rejects(
        create_admin_session(changedIdentity, {}),
        (error: unknown) =>
          error instanceof AppError &&
          error.error_code === 'ADMIN_ACCESS_DENIED',
      );
      await assert.rejects(
        mobile_login(changedIdentity),
        (error: unknown) =>
          error instanceof AppError && error.error_code === 'IDENTITY_CONFLICT',
      );
      assert.equal(
        await prisma.authAccount.count({ where: { user_id: other.id } }),
        0,
      );
      assert.equal(
        (
          await prisma.authAccount.findUniqueOrThrow({
            where: {
              provider_provider_account_id: {
                provider: 'GOOGLE',
                provider_account_id: identity.provider_account_id,
              },
            },
          })
        ).user_id,
        original.id,
      );
    });
  },
);
