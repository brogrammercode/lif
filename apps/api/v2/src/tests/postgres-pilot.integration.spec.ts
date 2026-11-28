import sharp from 'sharp';
import { PayoutTransfer } from '../features/wallet/payout-transfer.js';
import { PartnerProgramService } from '../features/partner_program/partner_program.service.js';
import {
  create_activation,
  reveal_activation,
} from '../features/partner_program/partner_program.security.js';
import { LIVE_SELFIE_ID } from '../features/partner_program/partner_selfie.constant.js';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { it } from 'node:test';
import { create_application } from '../bootstrap.js';
import { config } from '../core/config.js';
import { PostgresService } from '../database/postgres.service.js';
import { create_access_token } from '../infra/security/token.js';
import { PaymentRepository } from '../features/payment/payment.repo.js';
import { PlacesRepository } from '../features/places/places.repo.js';
import { RideRepository } from '../features/ride/ride.repo.js';
import { DriverRepository } from '../features/driver/driver.repo.js';
import { DriverOperationsService } from '../features/driver_operations/driver_operations.service.js';
import { PartnerDocumentService } from '../features/partner_program/partner_document.service.js';
import { PartnerDeliveryService } from '../features/partner_program/partner_delivery.service.js';
import { PartnerApplicationDeletionService } from '../features/partner_program/partner_application_deletion.service.js';
import { PartnerExitService } from '../features/partner_program/partner_exit.service.js';
import { VehicleVerificationService } from '../features/vehicle_verification/vehicle_verification.service.js';
import { WalletTopUps } from '../features/wallet/wallet-topups.js';
import { PayoutAdmin } from '../features/wallet/payout-admin.js';
import { RideUpi } from '../features/wallet/ride-upi.js';
import { WalletRideRepository } from '../features/wallet/wallet-ride.repository.js';
import { WalletRepository } from '../features/wallet/wallet.repo.js';
import {
  PayoutMethods,
  payout_method_input,
} from '../features/wallet/payout-methods.js';
import type { RazorpayWallet } from '../features/wallet/razorpay-wallet.js';
import {
  vehicle_document_keys,
  vehicle_labels,
  vehicle_submission,
} from '../features/vehicle_verification/vehicle_verification.type.js';
import {
  claimAccountEmail,
  finishAccountEmail,
  type AccountEmail,
} from '../infra/mail/account-email.sql.js';
import {
  create_refresh_token,
  create_token_hash,
} from '../infra/security/hash.js';
import { NEW_USER_EMAIL_TITLE } from '../infra/mail/new_user_email.js';

it(
  'runs migrated feature routes against isolated PostgreSQL',
  { skip: process.env.LIF_RUN_SQL_PILOT !== '1' },
  async (t) => {
    const url = new URL(config.DB_STRING);
    assert.equal(url.hostname, '127.0.0.1');
    assert.equal(url.pathname, '/lif_migration_test');
    const app = await create_application({ logger: false });
    try {
      const db = app.get(PostgresService);
      const result = await db.query<{ db: string }>(
        'SELECT current_database() AS db',
      );
      assert.equal(result.rows[0]?.db, 'lif_migration_test');
      await app.listen(0, '127.0.0.1');
      const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/api/v2`;
      const owner = randomUUID();
      const stranger = randomUUID();
      const driver = randomUUID();
      const driverProfile = randomUUID();
      const admin = randomUUID();
      await db.query(
        'INSERT INTO users (id, updated_at) VALUES ($1, NOW()), ($2, NOW())',
        [owner, stranger],
      );
      await db.query(
        "INSERT INTO users (id, role, updated_at) VALUES ($1, 'DRIVER', NOW())",
        [driver],
      );
      await db.query(
        "INSERT INTO users (id, role, updated_at) VALUES ($1, 'ADMIN', NOW())",
        [admin],
      );
      await db.query(
        'INSERT INTO driver_profiles (id, user_id, updated_at) VALUES ($1, $2, NOW())',
        [driverProfile, driver],
      );
      async function request(
        path: string,
        actor = owner,
        method = 'GET',
        data?: object,
        key?: string,
        family?: string,
      ) {
        const response = await fetch(base + path, {
          method,
          headers: {
            Authorization: `Bearer ${create_access_token({ user_id: actor, role: actor === admin ? 'ADMIN' : actor === driver ? 'DRIVER' : 'RIDER', session_family_id: family })}`,
            ...(data ? { 'Content-Type': 'application/json' } : {}),
            ...(key ? { 'Idempotency-Key': key } : {}),
          },
          body: data ? JSON.stringify(data) : undefined,
        });
        return { status: response.status, body: await response.json() };
      }

      assert.equal((await request('/health')).body.data.database, 'connected');
      const registeringDriver = randomUUID();
      const driverRepository = app.get(DriverRepository);
      await db.query(
        'INSERT INTO users (id,partner_activated_at,updated_at) VALUES ($1,NOW(),NOW())',
        [registeringDriver],
      );
      const registration = await driverRepository.create_driver_profile(
        registeringDriver,
        { license_number: registeringDriver },
      );
      assert.ok(registration);
      assert.equal(registration.rating_average, '0');
      assert.deepEqual(registration.vehicles, []);
      assert.equal(registration.user.role, 'DRIVER');
      await assert.rejects(
        driverRepository.create_driver_profile(registeringDriver, {
          license_number: registeringDriver,
        }),
        { error_code: 'DRIVER_PROFILE_EXISTS' },
      );
      const accessPath = '/admin/access/1more-admin';
      const contactEmail = `sql-admin-${admin}@example.test`;
      await db.query('UPDATE users SET email=$2 WHERE id=$1', [
        admin,
        contactEmail,
      ]);
      const grantInput = { email: `sql-grant-${admin}@example.test` };
      await db.query(
        `INSERT INTO admin_pending_snapshots (key,payload,expires_at)
        VALUES ($1,'{}',NOW()+INTERVAL '1 hour')`,
        [admin],
      );
      const grant = await request(accessPath, admin, 'POST', grantInput);
      assert.equal(grant.status, 200);
      assert.equal(
        (
          await db.query(
            'SELECT key FROM admin_pending_snapshots WHERE key=$1',
            [admin],
          )
        ).rowCount,
        0,
      );
      const granted = grant.body.data.admin;
      assert.equal(granted.role, 'ADMIN');
      assert.equal(granted.granted_by.id, admin);
      assert.equal(granted.has_google_account, false);
      const outgoing = await db.query(
        "SELECT count(*)::int AS total FROM notifications WHERE user_id=$1 AND data->'details'->>'id'=$2",
        [admin, granted.id],
      );
      assert.equal(outgoing.rows[0]?.total, 1);
      const queuedEmail = (
        await db.query<AccountEmail>(
          "SELECT id,user_id,updated_at,data FROM notifications WHERE user_id=$1 AND data->'details'->>'id'=$2",
          [admin, granted.id],
        )
      ).rows[0]!;
      const claim = randomUUID();
      const candidate = { ...queuedEmail.data, claim, state: 'SENDING' };
      const emailClaims = await Promise.all([
        claimAccountEmail(db, queuedEmail, candidate),
        claimAccountEmail(db, queuedEmail, candidate),
      ]);
      assert.equal(emailClaims.filter(Boolean).length, 1);
      await finishAccountEmail(
        db,
        queuedEmail.id,
        'wrong-claim',
        { state: 'SKIPPED' },
        new Date(),
      );
      assert.equal(
        (
          await db.query(
            "SELECT data->>'state' AS state FROM notifications WHERE id=$1",
            [queuedEmail.id],
          )
        ).rows[0]?.state,
        'SENDING',
      );
      await finishAccountEmail(
        db,
        queuedEmail.id,
        claim,
        { ...candidate, state: 'SKIPPED' },
        new Date(),
      );
      assert.equal(
        (
          await db.query(
            "SELECT data->>'state' AS state FROM notifications WHERE id=$1",
            [queuedEmail.id],
          )
        ).rows[0]?.state,
        'SKIPPED',
      );
      assert.equal(
        (await request(accessPath, admin, 'POST', grantInput)).body.data
          .changed,
        false,
      );
      const revokePath = `${accessPath}/${granted.id}`;
      const outdated = await request(revokePath, admin, 'DELETE', {
        expected_access_version: '2020-01-01T00:00:00.000Z',
      });
      assert.equal(outdated.body.error_code, 'ADMIN_ACCESS_CONFLICT');
      const removed = await request(revokePath, admin, 'DELETE', {
        expected_access_version: granted.access_version,
      });
      assert.equal(removed.body.data.role, 'RIDER');
      assert.equal(removed.body.data.changed, true);
      const accessAudit = await db.query(
        'SELECT action FROM user_logs WHERE entity_id=$1 AND actor_id=$2 ORDER BY id',
        [granted.id, admin],
      );
      assert.deepEqual(
        accessAudit.rows.map((row) => row.action),
        ['GRANT_ADMIN_ACCESS', 'REVOKE_ADMIN_ACCESS'],
      );
      const mobileRefresh = create_refresh_token();
      await db.query(
        `INSERT INTO sessions (id,user_id,refresh_token_hash,expires_at,updated_at)
        VALUES ($1,$2,$3,NOW()+INTERVAL '1 hour',NOW())`,
        [randomUUID(), owner, create_token_hash(mobileRefresh)],
      );
      const rotations = await Promise.all([
        request('/auth/refresh', owner, 'POST', {
          refresh_token: mobileRefresh,
        }),
        request('/auth/refresh', owner, 'POST', {
          refresh_token: mobileRefresh,
        }),
      ]);
      assert.deepEqual(
        rotations.map((result) => result.status).sort(),
        [200, 401],
      );
      const refreshed = rotations.find((result) => result.status === 200)!.body
        .data;
      assert.equal(refreshed.user.id, owner);
      assert.equal(refreshed.user.last_known_latitude, null);
      const nextToken = { refresh_token: refreshed.refresh_token };
      assert.equal(
        (await request('/auth/logout', owner, 'POST', nextToken)).status,
        200,
      );
      assert.equal(
        (await request('/auth/refresh', owner, 'POST', nextToken)).status,
        401,
      );
      const categoryPath = '/admin/vehicle-categories';
      const categoryInput = {
        name: `SQL category ${admin}`,
        vehicle_type: 'SEDAN',
        capacity: 4,
        is_active: true,
        base_fare: 12.5,
      };
      const fare = {
        max_profit_km: 2.5,
        normal_fare_per_km: 10.5,
        profit_fare_per_km: 20,
        commission_percent: 12.25,
      };
      assert.equal(
        (await request(categoryPath, owner, 'POST', categoryInput)).status,
        403,
      );
      const category = await request(categoryPath, admin, 'POST', {
        ...categoryInput,
        fare_policy: fare,
      });
      assert.equal(category.status, 201);
      assert.deepEqual(category.body.data.fare_policy, fare);
      assert.equal(category.body.data.base_fare, 12.5);
      const parentId = category.body.data.id;
      const child = await request(categoryPath, admin, 'POST', {
        ...categoryInput,
        name: `SQL child ${admin}`,
        parent_id: parentId,
      });
      assert.equal(child.status, 201);
      assert.equal(child.body.data.fare_policy, null);
      assert.equal(child.body.data.parent.commission_percent, '12.25');
      const publicList = await request('/vehicle-categories');
      const publicParent = publicList.body.data.find(
        (row: { id: string }) => row.id === parentId,
      );
      assert.equal(publicParent.is_selectable, false);
      assert.equal(publicParent._count, undefined);
      const futureRevision = new Date(Date.now() + 60_000);
      await db.query(
        'UPDATE vehicle_categories SET updated_at=$2 WHERE id=$1',
        [parentId, futureRevision],
      );
      const updatedInput = {
        name: categoryInput.name,
        vehicle_type: 'SEDAN',
        capacity: 4,
        is_active: false,
        expected_updated_at: futureRevision.toISOString(),
      };
      const edits = await Promise.all([
        request(`${categoryPath}/${parentId}`, admin, 'PATCH', updatedInput),
        request(`${categoryPath}/${parentId}`, admin, 'PATCH', updatedInput),
      ]);
      const saved = edits.find((edit) => edit.status === 200);
      assert.ok(saved);
      assert.deepEqual(saved.body.data.fare_policy, fare);
      assert.equal(saved.body.data.base_fare, 12.5);
      assert.equal(
        Date.parse(saved.body.data.updated_at),
        futureRevision.getTime() + 1,
      );
      assert.equal(
        edits.find((edit) => edit.status === 409)?.body.error_code,
        'CATEGORY_CONFLICT',
      );
      assert.equal(
        (await request('/vehicle-categories')).body.data.some(
          (row: { id: string }) => row.id === child.body.data.id,
        ),
        false,
      );
      const categoryAudit = await db.query(
        'SELECT action FROM user_logs WHERE entity_id=$1 AND actor_id=$2',
        [parentId, admin],
      );
      assert.deepEqual(categoryAudit.rows.map((row) => row.action).sort(), [
        'CREATE_VEHICLE_CATEGORY',
        'UPDATE_VEHICLE_CATEGORY',
      ]);
      const farePath = '/admin/fare-policy';
      const fareBefore = await request(farePath, admin);
      assert.equal(fareBefore.status, 200);
      const fareInput = {
        expected_version: fareBefore.body.data.version,
        cash_enabled: true,
        direct_upi_enabled: true,
        online_payment_enabled: false,
        commission_percent: 0,
        free_cancellation_minutes: 2,
        free_pickup_wait_minutes: 5,
        cancellation_fee_percent: 10.5,
        maximum_cancellation_fee: 100,
        rates: [
          {
            category_id: child.body.data.id,
            expected_updated_at: child.body.data.updated_at.replace(
              '.000Z',
              'Z',
            ),
            fare_policy: fare,
          },
        ],
      };
      const invalidFare = await request(farePath, admin, 'PATCH', {
        ...fareInput,
        rates: [
          ...fareInput.rates,
          { ...fareInput.rates[0], category_id: 'missing' },
        ],
      });
      assert.equal(invalidFare.body.error_code, 'CATEGORY_FARE_CONFLICT');
      const fareAfterFailure = await request(farePath, admin);
      assert.equal(
        fareAfterFailure.body.data.version,
        fareInput.expected_version,
      );
      assert.equal(
        fareAfterFailure.body.data.rates.find(
          (row: { category_id: string }) =>
            row.category_id === child.body.data.id,
        ).fare_policy,
        null,
      );
      const policySaved = await request(farePath, admin, 'PATCH', fareInput);
      assert.equal(policySaved.status, 200);
      assert.equal(
        policySaved.body.data.version,
        fareInput.expected_version + 1,
      );
      assert.equal(policySaved.body.data.updated_by.id, admin);
      assert.equal(policySaved.body.data.cancellation_fee_percent, 10.5);
      const savedChild = policySaved.body.data.rates.find(
        (row: { category_id: string }) =>
          row.category_id === child.body.data.id,
      );
      assert.deepEqual(savedChild.fare_policy, fare);
      assert.deepEqual(
        policySaved.body.data.rates.find(
          (row: { category_id: string }) => row.category_id === parentId,
        ).fare_policy,
        fare,
      );
      assert.equal(
        (await request(farePath, admin, 'PATCH', fareInput)).body.error_code,
        'FARE_POLICY_CONFLICT',
      );
      const cleared = await request(farePath, admin, 'PATCH', {
        ...fareInput,
        expected_version: policySaved.body.data.version,
        rates: [
          {
            ...fareInput.rates[0],
            expected_updated_at: savedChild.updated_at,
            fare_policy: null,
          },
        ],
      });
      assert.equal(cleared.status, 200);
      assert.equal(
        cleared.body.data.rates.find(
          (row: { category_id: string }) =>
            row.category_id === child.body.data.id,
        ).fare_policy,
        null,
      );
      const contactsPath = '/admin/support/configuration/contact';
      const contacts = await request(contactsPath, admin);
      assert.equal(contacts.status, 200);
      const contactsInput = {
        expected_version: contacts.body.data.version,
        support_phone: ' +15550100001 ',
        emergency_phone: '112',
        whatsapp_phone: ' ',
        support_email: 'help@example.test',
        support_hours: null,
        instructions: null,
      };
      const savedContacts = await request(
        contactsPath,
        admin,
        'PATCH',
        contactsInput,
      );
      assert.equal(savedContacts.status, 200);
      assert.equal(savedContacts.body.data.updated_by.id, admin);
      assert.equal(savedContacts.body.data.whatsapp_phone, null);
      const publicContacts = await request('/support/configuration');
      assert.equal(publicContacts.body.data.updated_by, undefined);
      assert.equal(publicContacts.body.data.support_phone, '+15550100001');
      assert.equal(
        (await request(contactsPath, admin, 'PATCH', contactsInput)).body
          .error_code,
        'SUPPORT_CONFIGURATION_CONFLICT',
      );
      const readAudit = await request(
        `/admin/activity?actor_id=${admin}&activity=changes&outcome=success&page=1000`,
        admin,
      );
      assert.equal(readAudit.status, 200);
      assert.equal(readAudit.body.data.page, 1);
      assert.ok(
        readAudit.body.data.activities.some(
          (row: { path: string; actor: { id: string }; status_code: number }) =>
            row.path === `/api/v2${categoryPath}` &&
            row.actor.id === admin &&
            row.status_code === 201,
        ),
      );
      const legacyPath =
        '/api/v2/admin/partner-program/applications/123/approve';
      const oldAction =
        'POST /api/v2/admin/partner-program/applications/:id/approve';
      await db.query(
        `INSERT INTO admin_activity (id,request_id,actor_id,method,path,action,status_code,started_at,completed_at)
        VALUES ($1,$2,$3,'POST',$4,$5,200,NOW(),NOW()),
          ($6,$7,$3,'POST',$4,$5,200,NOW()-INTERVAL '8 days',NOW()-INTERVAL '8 days')`,
        [
          randomUUID(),
          randomUUID(),
          admin,
          legacyPath,
          oldAction,
          randomUUID(),
          randomUUID(),
        ],
      );
      const legacy = await request(
        `/admin/activity?actor_id=${admin}&query=APPROVE_PARTNER_APPLICATION&activity=changes`,
        admin,
      );
      assert.equal(legacy.status, 200);
      assert.equal(legacy.body.data.total, 1);
      assert.equal(
        legacy.body.data.activities[0].action,
        'Approve partner application',
      );
      const sectionPath = '/admin/partner-program/requirement-categories';
      const fieldPath = '/admin/partner-program/requirements';
      const section = await request(sectionPath, admin, 'POST', {
        name: `SQL section ${admin}`,
      });
      assert.equal(section.status, 201);
      const sectionId = section.body.data.id;
      const fieldInput = {
        category_id: sectionId,
        key: `pdf_${admin.replaceAll('-', '')}`,
        label: 'Partner permit',
        field_type: 'PDF',
      };
      const field = await request(fieldPath, admin, 'POST', fieldInput);
      assert.equal(field.status, 201);
      assert.deepEqual(field.body.data.allowed_extensions, ['.pdf']);
      const requirements = await request('/partner-program/requirements');
      assert.ok(
        requirements.body.data.documents.some(
          (row: { id: string }) => row.id === field.body.data.id,
        ),
      );
      const listedFields = await request(
        `${fieldPath}?category_id=${sectionId}&section=documents&page=1000`,
        admin,
      );
      assert.equal(listedFields.status, 200);
      assert.equal(listedFields.body.data.total, 1);
      assert.equal(listedFields.body.data.page, 1);
      const changed = await request(
        `${fieldPath}/${field.body.data.id}`,
        admin,
        'PATCH',
        {
          ...fieldInput,
          key: `inactive_${admin.replaceAll('-', '')}`,
          is_active: false,
          expected_updated_at: field.body.data.updated_at,
        },
      );
      assert.equal(changed.status, 200);
      assert.equal(changed.body.data.is_active, false);
      const staleDelete = await request(
        `${sectionPath}/${sectionId}`,
        admin,
        'DELETE',
        {
          expected_updated_at: section.body.data.updated_at,
        },
      );
      assert.equal(staleDelete.body.error_code, 'REQUIREMENT_CONFLICT');
      const sections = await request(sectionPath, admin);
      const updatedSection = sections.body.data.find(
        (row: { id: string }) => row.id === sectionId,
      );
      assert.equal(updatedSection._count.fields, 1);
      const deleted = await request(
        `${sectionPath}/${sectionId}`,
        admin,
        'DELETE',
        {
          expected_updated_at: updatedSection.updated_at,
        },
      );
      assert.equal(deleted.body.data.deleted, true);
      assert.equal(
        (await request(`${fieldPath}?category_id=${sectionId}`, admin)).body
          .data.total,
        0,
      );
      const family = randomUUID();
      const sessionId = randomUUID();
      await db.query(
        `INSERT INTO sessions (id,user_id,refresh_token_hash,family_id,expires_at,updated_at)
        VALUES ($1,$2,$3,$4,NOW()+INTERVAL '1 hour',NOW())`,
        [sessionId, owner, randomUUID(), family],
      );
      assert.equal(
        (
          await request(
            '/me/saved-places',
            owner,
            'GET',
            undefined,
            undefined,
            family,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await request(
            '/me/saved-places',
            stranger,
            'GET',
            undefined,
            undefined,
            family,
          )
        ).status,
        401,
      );
      await db.query('UPDATE sessions SET revoked_at=NOW() WHERE id=$1', [
        sessionId,
      ]);
      assert.equal(
        (
          await request(
            '/me/saved-places',
            owner,
            'GET',
            undefined,
            undefined,
            family,
          )
        ).status,
        401,
      );
      const contact = await request('/me/emergency-contacts', owner, 'POST', {
        name: ' SQL fixture ',
        phone_e164: '+15550100000',
        relationship: 'Friend',
      });
      assert.equal(contact.status, 201);
      assert.equal(contact.body.data.name, 'SQL fixture');
      const contactId = contact.body.data.id;
      assert.equal(
        (await request('/emergency-contacts')).body.data[0].id,
        contactId,
      );
      const replacement = { name: 'Updated', phone_e164: '+15550100001' };
      assert.equal(
        (
          await request(
            `/emergency-contacts/${contactId}`,
            stranger,
            'PATCH',
            replacement,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            `/emergency-contacts/${contactId}`,
            owner,
            'PATCH',
            replacement,
          )
        ).body.data.relationship,
        'Friend',
      );
      assert.equal(
        (await request(`/emergency-contacts/${contactId}`, stranger, 'DELETE'))
          .status,
        404,
      );
      assert.equal(
        (await request(`/me/emergency-contacts/${contactId}`, owner, 'DELETE'))
          .status,
        200,
      );
      assert.equal((await request('/emergency-contacts')).body.data.length, 0);
      const logs = await db.query<{ action: string }>(
        'SELECT action FROM user_logs WHERE entity_id = $1 AND actor_id = $2 ORDER BY id',
        [contactId, owner],
      );
      assert.deepEqual(
        logs.rows.map((row) => row.action),
        [
          'CREATE_EMERGENCY_CONTACT',
          'UPDATE_EMERGENCY_CONTACT',
          'DELETE_EMERGENCY_CONTACT',
        ],
      );

      const ticketInput = {
        subject: 'SQL fixture ticket',
        body: 'First message',
      };
      const key = randomUUID();
      const ticket = await request(
        '/support/tickets',
        owner,
        'POST',
        ticketInput,
        key,
      );
      assert.equal(ticket.status, 201);
      const ticketId = ticket.body.data.id;
      assert.equal(
        (await request('/support/tickets', owner, 'POST', ticketInput, key))
          .body.data.id,
        ticketId,
      );
      const concurrentTicket = {
        subject: 'Concurrent fixture',
        body: 'One ticket',
      };
      const concurrentKey = randomUUID();
      const claims = await Promise.all([
        request(
          '/support/tickets',
          owner,
          'POST',
          concurrentTicket,
          concurrentKey,
        ),
        request(
          '/support/tickets',
          owner,
          'POST',
          concurrentTicket,
          concurrentKey,
        ),
      ]);
      assert.ok(claims.some((result) => result.status === 201));
      for (const claim of claims) {
        if (claim.status !== 201)
          assert.equal(claim.body.error_code, 'IDEMPOTENCY_IN_PROGRESS');
      }
      assert.equal(
        (
          await db.query(
            'SELECT id FROM support_tickets WHERE user_id=$1 AND subject=$2',
            [owner, concurrentTicket.subject],
          )
        ).rowCount,
        1,
      );
      assert.equal(
        (await request(`/support/tickets/${ticketId}`, stranger)).status,
        404,
      );
      assert.equal(
        (
          await request(
            `/support/tickets/${ticketId}/messages`,
            stranger,
            'POST',
            { body: 'Other account' },
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            `/support/tickets/${ticketId}/messages`,
            owner,
            'POST',
            { body: 'Follow-up' },
          )
        ).status,
        201,
      );
      const detail = await request(`/support/tickets/${ticketId}`);
      assert.deepEqual(
        detail.body.data.messages.map(
          (message: { body: string }) => message.body,
        ),
        ['First message', 'Follow-up'],
      );
      assert.match(detail.body.data.messages[0].created_at, /\.\d{3}Z$/);

      const ride = randomUUID();
      await db.query(
        `INSERT INTO rides
        (id, rider_id, driver_id, status, pickup_address, pickup_latitude, pickup_longitude,
        dropoff_address, dropoff_latitude, dropoff_longitude, completed_at, final_fare, created_at, updated_at)
        VALUES ($1, $2, $3, 'COMPLETED', 'Station', 25.2500, 87.01, 'Library', 25.26, 87.02,
        NOW(), 12.50, '2026-10-15T01:00:00Z', NOW())`,
        [ride, owner, driverProfile],
      );
      const liveRide = randomUUID();
      await db.query(
        `INSERT INTO rides
        (id, rider_id, driver_id, status, pickup_address, pickup_latitude, pickup_longitude,
        dropoff_address, dropoff_latitude, dropoff_longitude, created_at, updated_at)
        VALUES ($1, $2, $3, 'IN_PROGRESS', 'Library', 25.26, 87.02, 'Park', 25.28, 87.05,
        '2026-10-16T01:00:00Z', NOW())`,
        [liveRide, owner, driverProfile],
      );
      const fix = {
        captured_at: new Date().toISOString(),
        latitude: 25.26,
        longitude: 87.023,
      };
      const freshLocation = await request(
        '/driver/location',
        driver,
        'POST',
        fix,
      );
      assert.equal(freshLocation.status, 200);
      assert.equal(freshLocation.body.data.current_longitude, '87.023');
      const staleLocation = await request('/driver/location', driver, 'POST', {
        ...fix,
        longitude: 90,
        captured_at: new Date(Date.parse(fix.captured_at) - 5000).toISOString(),
      });
      assert.equal(staleLocation.body.data.current_longitude, '87.023');
      assert.equal(
        (
          await db.query('SELECT id FROM ride_locations WHERE ride_id=$1', [
            liveRide,
          ])
        ).rowCount,
        1,
      );
      const loadedDriverProfile = await request('/driver/profile', driver);
      assert.equal(loadedDriverProfile.status, 200);
      assert.equal(loadedDriverProfile.body.data.id, driverProfile);
      assert.equal(loadedDriverProfile.body.data.user.id, driver);
      assert.equal(
        (await request('/me/travel-context')).body.data.active_rider_ride.id,
        liveRide,
      );
      assert.equal(
        (await request('/driver/rides/current', driver)).body.data.id,
        liveRide,
      );
      const driverDashboard = await request('/driver/operations', driver);
      assert.equal(driverDashboard.status, 200);
      assert.deepEqual(driverDashboard.body.data.current_trip, {
        id: liveRide,
        status: 'IN_PROGRESS',
      });
      const tripContextPath = `/trips/${liveRide}/context`;
      const contextView = await request(tripContextPath);
      assert.equal(contextView.status, 200);
      assert.equal(contextView.body.data.trip.pickup_latitude, '25.26');
      assert.equal(contextView.body.data.trip.rider.phone_e164, undefined);
      assert.equal(
        contextView.body.data.trip.driver.user.phone_e164,
        undefined,
      );
      assert.equal((await request(tripContextPath, stranger)).status, 404);
      const chat = app.get(DriverOperationsService);
      const chatKey = randomUUID();
      const [sentMessage, replayedMessage] = await Promise.all([
        chat.send_message(owner, liveRide, 'At the pickup point', chatKey),
        chat.send_message(owner, liveRide, 'At the pickup point', chatKey),
      ]);
      assert.equal(sentMessage.id, replayedMessage.id);
      assert.equal((await chat.messages(driver, liveRide)).length, 1);
      await assert.rejects(
        chat.send_message(owner, liveRide, 'Changed text', chatKey),
        {
          error_code: 'MESSAGE_RETRY_CONFLICT',
        },
      );
      await assert.rejects(chat.messages(stranger, liveRide), {
        error_code: 'RIDE_NOT_FOUND',
      });
      await assert.rejects(chat.contact_attempt(owner, liveRide), {
        error_code: 'CONTACT_PHONE_UNAVAILABLE',
      });
      assert.deepEqual(
        (
          await request('/driver/rides?page_size=20', driver)
        ).body.data.rows.map((r: { id: string }) => r.id),
        [liveRide, ride],
      );
      const history = (
        await request('/me/rides?month=2026-10&section=completed')
      ).body.data;
      assert.deepEqual(history.counts, {
        all: 2,
        active: 1,
        completed: 1,
        cancelled: 0,
        unfulfilled: 0,
        past: 1,
      });
      assert.equal(history.rows[0].final_fare, '12.5');
      assert.equal(history.rows[0].pickup_latitude, '25.25');
      assert.equal(history.rows[0].driver.user.id, driver);
      assert.equal(history.rows[0].driver.user.phone_e164, undefined);
      assert.equal((await request('/me/rides', stranger)).body.data.total, 0);
      assert.equal(
        (await request(`/driver/rides/${ride}`, stranger)).status,
        404,
      );
      assert.equal(
        (await request(`/driver/rides/${ride}`, driver)).body.data.rider.id,
        owner,
      );

      await db.query("UPDATE rides SET status = 'CANCELLED' WHERE id = $1", [
        liveRide,
      ]);
      assert.equal(
        (await request('/me/travel-context')).body.data.active_rider_ride.id,
        ride,
      );
      assert.equal(
        (await request('/driver/rides/current', driver)).body.data.id,
        ride,
      );
      const cash = await request('/me/payment-methods/setup', owner, 'POST', {
        type: 'CASH',
      });
      assert.equal(cash.status, 201);
      assert.equal(cash.body.data.is_default, true);
      const methodId = cash.body.data.id;
      const upi = await request('/me/payment-methods/setup', owner, 'POST', {
        type: 'UPI',
        upi_handle: 'fixture@upi',
      });
      assert.equal(upi.status, 201);
      assert.equal(upi.body.data.is_default, false);
      assert.equal(
        (
          await request('/payment-methods', owner, 'POST', {
            type: 'UPI',
            upi_handle: 'FIXTURE@UPI',
          })
        ).body.data.id,
        upi.body.data.id,
      );
      assert.equal(
        (await request(`/me/payment-methods/${methodId}`, stranger, 'DELETE'))
          .status,
        404,
      );
      const checkout = await request(
        `/rides/${ride}/payment/checkout`,
        owner,
        'POST',
        { payment_method_id: methodId },
        randomUUID(),
      );
      assert.equal(checkout.status, 201);
      assert.equal(checkout.body.data.amount, '12.5');
      const paymentRepo = app.get(PaymentRepository);
      const providerPayment = {
        ride_id: ride,
        provider_payment_id: randomUUID(),
        status: 'CAPTURED' as const,
      };
      await assert.rejects(
        paymentRepo.process_webhook('fixture', {
          ...providerPayment,
          amount: 12.5,
        }),
        { error_code: 'DIRECT_PAYMENT_WEBHOOK_UNSUPPORTED' },
      );
      // Model a legacy gateway-owned payment using only this isolated fixture.
      await db.query(
        'UPDATE payments SET collection_method=NULL WHERE ride_id=$1',
        [ride],
      );
      await assert.rejects(
        paymentRepo.process_webhook('fixture', {
          ...providerPayment,
          amount: 12,
        }),
        { error_code: 'PAYMENT_AMOUNT_MISMATCH' },
      );
      const captures = await Promise.all([
        paymentRepo.process_webhook('fixture', {
          ...providerPayment,
          amount: 12.5,
        }),
        paymentRepo.process_webhook('fixture', {
          ...providerPayment,
          amount: 12.5,
        }),
      ]);
      assert.ok(captures.every((payment) => payment?.status === 'CAPTURED'));
      assert.equal(
        (
          await db.query(
            "SELECT id FROM ride_events WHERE ride_id=$1 AND event_type='PAYMENT_CAPTURED'",
            [ride],
          )
        ).rowCount,
        1,
      );
      const receipt = await request(`/rides/${ride}/receipt`);
      assert.equal(receipt.status, 200);
      assert.equal(receipt.body.data.payment.amount, '12.5');
      assert.equal(receipt.body.data.driver.user.phone_e164, undefined);
      assert.equal(
        (await request(`/rides/${ride}/receipt`, stranger)).status,
        404,
      );
      assert.equal(
        (await request('/me/travel-context')).body.data.active_rider_ride,
        null,
      );

      const adminName = 'Pilot ' + admin.slice(0, 8);
      await db.query('UPDATE users SET first_name=$1 WHERE id=$2', [
        adminName,
        admin,
      ]);
      const directory = await request(
        '/admin/access/1more-admin?query=' +
          encodeURIComponent(adminName) +
          '&page=99&page_size=1',
        admin,
      );
      assert.equal(directory.status, 200);
      assert.equal(directory.body.data.page, 1);
      assert.equal(directory.body.data.total, 1);
      assert.equal(directory.body.data.admins[0].id, admin);
      assert.equal(directory.body.data.admins[0].has_google_account, false);
      assert.equal(directory.body.data.admins[0].login_audit, undefined);
      const emptyDirectory = await request(
        '/admin/access/1more-admin?status=SUSPENDED&query=' +
          encodeURIComponent(adminName),
        admin,
      );
      assert.deepEqual(emptyDirectory.body.data.admins, []);
      assert.equal(
        emptyDirectory.body.data.stats.total_admins,
        directory.body.data.stats.total_admins,
      );

      const notificationId = randomUUID();
      await db.query(
        `INSERT INTO notifications (id, user_id, type, channel, title, body, data, updated_at)
        VALUES ($1, $2, 'SYSTEM', 'EMAIL', $3, 'Fixture', $4::jsonb, NOW())`,
        [
          notificationId,
          admin,
          NEW_USER_EMAIL_TITLE,
          JSON.stringify({
            kind: 'ADMIN_NEW_USER_EMAIL',
            state: 'FAILED',
            recipient_email: 'fixture@example.test',
            details: { id: owner, name: 'Fixture rider' },
          }),
        ],
      );
      const pending = await request(
        '/admin/pending-counts?user_ids=' + driver + '&application_ids=fixture',
        admin,
      );
      assert.equal(pending.status, 200);
      assert.ok(pending.body.data.tabs.registration_emails >= 1);
      assert.equal(
        pending.body.data.entities.users[driver].vehicle_verification,
        0,
      );
      const deliveries = await request(
        '/admin/registration-emails?status=pending',
        admin,
      );
      assert.ok(
        deliveries.body.data.items.some(
          (item: { id: string }) => item.id === notificationId,
        ),
      );
      assert.equal(
        (
          await request(
            `/admin/registration-emails/${notificationId}/retry`,
            stranger,
            'POST',
          )
        ).status,
        403,
      );
      const queued = await request(
        `/admin/registration-emails/${notificationId}/retry`,
        admin,
        'POST',
      );
      assert.equal(queued.status, 200);
      assert.equal(queued.body.data.queued, 1);
      assert.equal(
        (
          await db.query<{ state: string }>(
            "SELECT data->>'state' AS state FROM notifications WHERE id = $1",
            [notificationId],
          )
        ).rows[0]?.state,
        'PENDING',
      );

      const profile = await request('/me', owner, 'PATCH', {
        first_name: ' Pilot ',
        last_name: 'Rider',
        phone_e164:
          '+1555' +
          String(Number.parseInt(owner.slice(0, 6), 16)).padStart(8, '0'),
      });
      assert.equal(profile.status, 200);
      assert.equal(profile.body.data.first_name, 'Pilot');
      const avatar = await request('/me/avatar', owner, 'POST', {
        avatar_url: 'https://example.test/avatar.webp',
      });
      assert.equal(
        avatar.body.data.avatar_url,
        'https://example.test/avatar.webp',
      );
      assert.equal(
        (
          await request('/me/location', owner, 'PATCH', {
            latitude: 25.25,
            longitude: 87.01,
          })
        ).body.data.updated,
        true,
      );
      const placeInput = {
        label: 'Home',
        address: 'Station',
        latitude: 25.25,
        longitude: 87.01,
      };
      const place = await request('/me/saved-places', owner, 'POST', {
        ...placeInput,
        place_data: { preview: true },
      });
      assert.equal(place.status, 201);
      const placeId = place.body.data.id;
      assert.equal(place.body.data.latitude, '25.25');
      assert.equal(
        (await request('/me/saved-places', stranger)).body.data.length,
        0,
      );
      assert.equal(
        (
          await request(
            `/me/saved-places/${placeId}`,
            stranger,
            'PATCH',
            placeInput,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(`/me/saved-places/${placeId}`, owner, 'PATCH', {
            ...placeInput,
            address: 'New station',
          })
        ).body.data.place_data.preview,
        true,
      );
      assert.equal(
        (await request(`/me/saved-places/${placeId}`, owner, 'DELETE')).status,
        200,
      );
      assert.equal(
        (await request('/me/notifications', admin)).body.data.some(
          (item: { id: string }) => item.id === notificationId,
        ),
        false,
      );
      assert.equal(
        (
          await request(
            `/me/notifications/${notificationId}/read`,
            admin,
            'POST',
          )
        ).status,
        404,
      );
      const mobileNotificationId = randomUUID();
      await db.query(
        `INSERT INTO notifications (id, user_id, type, title, body, updated_at)
        VALUES ($1, $2, 'SYSTEM', 'Fixture mobile alert', 'Fixture', NOW())`,
        [mobileNotificationId, owner],
      );
      assert.equal(
        (await request('/me/notifications')).body.data[0].id,
        mobileNotificationId,
      );
      assert.equal(
        (
          await request(
            `/me/notifications/${mobileNotificationId}/read`,
            stranger,
            'POST',
          )
        ).status,
        404,
      );
      assert.match(
        (
          await request(
            `/me/notifications/${mobileNotificationId}/read`,
            owner,
            'POST',
          )
        ).body.data.read_at,
        /Z$/,
      );

      const verification = await request(
        `/admin/drivers/${driverProfile}/verification`,
        admin,
        'PATCH',
        { status: 'VERIFIED' },
      );
      assert.equal(verification.status, 200);
      assert.equal(verification.body.data.verification_status, 'VERIFIED');
      const searchingRide = randomUUID();
      await db.query(
        `INSERT INTO rides
        (id, rider_id, status, pickup_address, pickup_latitude, pickup_longitude,
        dropoff_address, dropoff_latitude, dropoff_longitude, updated_at)
        VALUES ($1, $2, 'SEARCHING', 'Station', 25.25, 87.01, 'Park', 25.26, 87.02, NOW())`,
        [searchingRide, owner],
      );
      const categoryId = randomUUID();
      await db.query(
        `INSERT INTO vehicle_categories
        (id, code, name, vehicle_type, capacity, base_fare, per_kilometer, per_minute, updated_at)
        VALUES ($1, $1, 'Fixture category', 'SEDAN', 4, 1, 1, 1, NOW())`,
        [categoryId],
      );
      const registeredVehicle = await driverRepository.create_vehicle(
        registeringDriver,
        {
          make: 'Fixture',
          model: 'Sedan',
          plate_number: registeringDriver,
          vehicle_category_id: categoryId,
        },
      );
      assert.ok(registeredVehicle);
      assert.equal(registeredVehicle.vehicle_category_id, categoryId);
      assert.equal(
        (
          await db.query(
            'SELECT active_vehicle_id FROM driver_profiles WHERE id=$1',
            [registration.id],
          )
        ).rows[0]?.active_vehicle_id,
        registeredVehicle.id,
      );
      const registeredVehiclePath = `/driver/vehicles/${registeredVehicle.id}/category`;
      assert.equal(
        (
          await request(registeredVehiclePath, driver, 'PATCH', {
            vehicle_category_id: categoryId,
          })
        ).status,
        404,
      );
      const categoryChange = await driverRepository.change_vehicle_category(
        registeringDriver,
        registeredVehicle.id,
        categoryId,
      );
      assert.ok(categoryChange);
      assert.equal(categoryChange.vehicle_category.base_fare, '1');
      const vehicleId = randomUUID();
      await db.query(
        `INSERT INTO vehicles (id, driver_id, type, status, make, model, plate_number, capacity, vehicle_category_id, updated_at)
        VALUES ($1, $2, 'SEDAN', 'ACTIVE', 'Fixture', 'Sedan', $1, 4, $3, NOW())`,
        [vehicleId, driverProfile, categoryId],
      );
      await db.query(
        "UPDATE driver_profiles SET availability = 'AVAILABLE', active_vehicle_id = $1 WHERE id = $2",
        [vehicleId, driverProfile],
      );
      await db.query(
        `INSERT INTO fare_quotes (id, ride_id, vehicle_type, distance_m, duration_s, base_fare,
        distance_fare, time_fare, total_fare, expires_at, selected_at, vehicle_category_id, updated_at)
        VALUES ($1, $2, 'SEDAN', 1000, 60, 1, 1, 1, 3, NOW()+INTERVAL '1 hour', NOW(), $3, NOW())`,
        [randomUUID(), searchingRide, categoryId],
      );
      const offerPath = `/admin/rides/${searchingRide}/offers`;
      const offered = await request(offerPath, admin, 'POST', {
        driver_id: driverProfile,
      });
      assert.equal(offered.status, 201);
      assert.equal(offered.body.data.status, 'SENT');
      const duplicate = await request(offerPath, admin, 'POST', {
        driver_id: driverProfile,
      });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error_code, 'RIDE_OFFER_EXISTS');
      const offerId = offered.body.data.id;
      assert.equal(
        await driverRepository.reject_offer(registeringDriver, offerId),
        false,
      );
      const rejectedOffer = await request(
        `/driver/offers/${offerId}/reject`,
        driver,
        'POST',
      );
      assert.equal(rejectedOffer.status, 200);
      const rejectedAgain = await request(
        `/driver/offers/${offerId}/reject`,
        driver,
        'POST',
      );
      assert.equal(rejectedAgain.body.error_code, 'OFFER_NOT_AVAILABLE');
      assert.equal(
        (
          await db.query('SELECT status FROM ride_offers WHERE id=$1', [
            offerId,
          ])
        ).rows[0]?.status,
        'REJECTED',
      );

      const payoutInput = {
        request_key: randomUUID(),
        details: {
          holder_name: 'Fixture Driver',
          account_number: '001234567890',
          ifsc: 'ABCD0123456',
        },
      };
      const payout = await request(
        '/driver/payout-changes',
        driver,
        'POST',
        payoutInput,
      );
      assert.equal(payout.status, 200);
      assert.equal(payout.body.data.summary.account_number, '****7890');
      assert.equal(
        (await request('/driver/payout-changes', driver, 'POST', payoutInput))
          .body.data.id,
        payout.body.data.id,
      );
      const reviewPath = `/admin/payout-changes/${payout.body.data.id}`;
      assert.equal(
        (await request(`${reviewPath}/private`, driver)).status,
        403,
      );
      const privatePayout = await request(`${reviewPath}/private`, admin);
      assert.deepEqual(privatePayout.body.data.details, payoutInput.details);
      const reviewInput = {
        expected_version: 1,
        status: 'APPROVED',
        note: 'Fixture ownership checked',
      };
      const reviews = await Promise.all([
        request(reviewPath, admin, 'PATCH', reviewInput),
        request(reviewPath, admin, 'PATCH', reviewInput),
      ]);
      assert.deepEqual(
        reviews.map((result) => result.status).sort(),
        [200, 409],
      );
      const driverAccount = await request('/driver/account', driver);
      assert.equal(driverAccount.body.data.approved_payout.status, 'APPROVED');
      assert.equal(
        JSON.stringify(driverAccount.body.data).includes(
          payoutInput.details.account_number,
        ),
        false,
      );
      await db.query(
        `INSERT INTO ride_settlement_reviews (id,ride_id,reported_by_id,driver_id,kind,status,reason,fee_amount,updated_at)
          VALUES ($1,$2,$3,$4,'CANCELLATION','APPROVED','Fixture',5.25,NOW())`,
        [randomUUID(), searchingRide, driver, driverProfile],
      );
      const statement = await request('/driver/finances', driver);
      assert.equal(statement.status, 200);
      assert.equal(statement.body.data.summary.gross_fares, '12.5');
      assert.equal(statement.body.data.summary.other_received, '12.5');
      assert.equal(statement.body.data.summary.approved_charges_due, '5.25');
      assert.equal((await request('/driver/finances', stranger)).status, 404);

      const adminHistory = await request(
        `/admin/users/${owner}/rides?status=completed&page=999`,
        admin,
      );
      assert.equal(adminHistory.status, 200);
      assert.equal(adminHistory.body.data.page, 1);
      assert.equal(adminHistory.body.data.items[0].id, ride);
      assert.equal(adminHistory.body.data.items[0].access_code, undefined);
      const driverHistory = await request(
        `/admin/users/${driver}/rides?status=completed`,
        admin,
      );
      assert.equal(driverHistory.body.data.items[0].id, ride);
      assert.equal(driverHistory.body.data.role, 'driver');
      const listedDriver = await request(
        `/admin/users?account_type=driver&query=${driver}`,
        admin,
      );
      assert.equal(listedDriver.body.data.total, 1);
      {
        const placeInput = {
          name: `Fixture park ${owner}`,
          address: 'Fixture lane',
          latitude: 25.2567,
          longitude: 87.02,
          phone: '+15550100001',
        };
        const contributed = await request('/places', owner, 'POST', placeInput);
        assert.equal(contributed.status, 200);
        const placeId = contributed.body.data.id;
        const placePath = `/places/${placeId}`;
        const savedQuery = `/places?scope=saved&query=${owner}`;
        assert.equal((await request(savedQuery)).body.data.total, 1);
        assert.equal((await request(savedQuery, stranger)).body.data.total, 0);
        const shared = await request('/places', stranger, 'POST', placeInput);
        assert.equal(shared.body.data.id, placeId);
        assert.equal((await request(savedQuery, stranger)).body.data.total, 1);
        assert.equal(
          (
            await request(placePath, stranger, 'PATCH', {
              ...placeInput,
              version: 1,
              address: 'Forbidden',
            })
          ).body.error_code,
          'PLACE_CHANGED',
        );
        const { phone: _, ...placeEdit } = placeInput;
        assert.equal(
          (
            await request(placePath, owner, 'PATCH', {
              ...placeEdit,
              version: 1,
              address: 'Updated fixture lane',
            })
          ).status,
          200,
        );
        const changedPlace = await request(placePath);
        assert.equal(changedPlace.body.data.phone, placeInput.phone);
        assert.equal(changedPlace.body.data.address, 'Updated fixture lane');
        assert.equal(changedPlace.body.data.version, 2);
        await request(`${placePath}/visit`, stranger, 'PUT', { value: true });
        await request(`${placePath}/review`, stranger, 'PUT', {
          score: 4,
          comment: 'Quiet',
        });
        const reviewList = await request(`${placePath}/reviews`);
        assert.equal(reviewList.body.data.rows[0].user.id, stranger);
        assert.equal(reviewList.body.data.rows[0].user.phone_e164, undefined);
        assert.equal(
          (await request(placePath, stranger)).body.data.own_review.score,
          4,
        );
        assert.equal((await request(placePath)).body.data.own_review, null);
        const photos = app.get(PlacesRepository);
        const photoInput = {
          request_key: 'fixture-photo',
          content_hash: 'fixture-hash',
          url: 'https://example.test/photo.png',
          public_id: 'fixture-only',
        };
        const attached = await photos.photo(owner, placeId, photoInput);
        assert.equal(
          (await photos.photo(owner, placeId, photoInput)).photo.id,
          attached.photo.id,
        );
        assert.equal(
          (await request(placePath)).body.data.photos[0].id,
          attached.photo.id,
        );
        await assert.rejects(
          photos.remove_photo(stranger, placeId, attached.photo.id),
          { error_code: 'PLACE_PHOTO_NOT_FOUND' },
        );
        await photos.remove_photo(owner, placeId, attached.photo.id);
        assert.equal(
          (await request(placePath, owner, 'DELETE', { version: 2 })).body.data
            .removed,
          true,
        );
        assert.equal((await request(savedQuery, stranger)).body.data.total, 0);
      }
      const userPath = `/admin/users/${stranger}`;
      const userBefore = await request(userPath, admin);
      const updatedUser = await request(userPath, admin, 'PATCH', {
        expected_updated_at: userBefore.body.data.updated_at,
        first_name: 'Fixture revised',
        last_name: null,
        phone_e164: null,
        avatar_url: null,
      });
      assert.equal(updatedUser.status, 200);
      assert.equal(updatedUser.body.data.first_name, 'Fixture revised');
      assert.equal(
        (
          await request(userPath, admin, 'DELETE', {
            expected_updated_at: userBefore.body.data.updated_at,
            confirmation: stranger,
          })
        ).body.error_code,
        'USER_CONFLICT',
      );
      const ownerPath = `/admin/users/${owner}`;
      const bookedOwner = await request(ownerPath, admin);
      assert.equal(
        (
          await request(ownerPath, admin, 'DELETE', {
            expected_updated_at: bookedOwner.body.data.updated_at,
            confirmation: owner,
          })
        ).body.error_code,
        'USER_HAS_ACTIVE_RIDE',
      );
      const deactivated = await request(userPath, admin, 'DELETE', {
        expected_updated_at: updatedUser.body.data.updated_at,
        confirmation: stranger,
      });
      assert.equal(deactivated.body.data.changed, true);
      assert.equal((await request(userPath, admin)).status, 404);
      const retained = await db.query(
        'SELECT status,deleted_at FROM users WHERE id=$1',
        [stranger],
      );
      assert.equal(retained.rows[0]?.status, 'DELETED');
      assert.ok(retained.rows[0]?.deleted_at);

      const catalogBrandName = `Fixture brand ${admin}`;
      const createdBrand = await request(
        '/admin/vehicle-brands',
        admin,
        'POST',
        { name: catalogBrandName },
      );
      assert.equal(createdBrand.status, 201);
      const catalogBrandId = createdBrand.body.data.id;
      const brandQuery = `/vehicle-brands?query=${admin}`;
      const brandChoices = await request(brandQuery);
      assert.equal(brandChoices.body.data.rows[0].id, catalogBrandId);
      assert.equal(brandChoices.body.data.rows[0].requested_by_id, undefined);
      const verificationCatalog = '/driver/vehicle-verification/catalog';
      const enrollmentBrands = await request(
        `${verificationCatalog}?query=${admin.toUpperCase()}`,
        driver,
      );
      assert.equal(enrollmentBrands.status, 200);
      assert.equal(enrollmentBrands.body.data.rows[0].id, catalogBrandId);
      assert.equal(
        enrollmentBrands.body.data.rows[0].requested_by_id,
        undefined,
      );
      const importInput = {
        kind: 'models',
        rows: [
          {
            row: 2,
            values: {
              brand_name: catalogBrandName.toUpperCase(),
              name: `Fixture model ${admin}`,
              vehicle_type: 'sedan',
              fuel_type: 'petrol',
              seating_capacity: '4',
            },
          },
        ],
      };
      const imported = await request(
        '/admin/vehicle-catalog/import',
        admin,
        'POST',
        importInput,
      );
      assert.equal(imported.status, 200);
      assert.equal(imported.body.data.created, 1);
      assert.equal(
        (
          await request(
            '/admin/vehicle-catalog/import',
            admin,
            'POST',
            importInput,
          )
        ).body.data.skipped,
        1,
      );
      assert.equal(
        (await request(`/vehicle-models?brand_id=${catalogBrandId}`)).body.data
          .total,
        1,
      );
      const enrollmentModels = await request(
        `${verificationCatalog}?brand_id=${catalogBrandId}`,
        driver,
      );
      assert.equal(enrollmentModels.status, 200);
      assert.equal(enrollmentModels.body.data.total, 1);
      assert.equal(enrollmentModels.body.data.rows[0].brand_id, catalogBrandId);
      const availableAsset = randomUUID();
      const pendingAsset = randomUUID();
      await db.query(
        `INSERT INTO vehicle_verification_assets (id,owner_id,vehicle_id,field_key,file_name,bytes)
          VALUES ($1,$2,$3,'registration','registration.pdf',$4),
            ($5,$2,NULL,'insurance','insurance.pdf',$4)`,
        [
          availableAsset,
          driver,
          vehicleId,
          Buffer.from('%PDF-fixture'),
          pendingAsset,
        ],
      );
      const verificationList = await request(
        '/driver/vehicle-verification',
        driver,
      );
      assert.equal(verificationList.status, 200);
      assert.equal(
        verificationList.body.data.vehicles[0].verification_assets[0].id,
        availableAsset,
      );
      assert.equal(
        verificationList.body.data.vehicles[0].verification_assets[0].bytes,
        undefined,
      );
      assert.equal(
        verificationList.body.data.pending_assets[0].id,
        pendingAsset,
      );
      const attachment = '/vehicle-verification/assets';
      assert.equal(
        (await request(`${attachment}/${availableAsset}`, admin)).status,
        200,
      );
      assert.equal(
        (await request(`${attachment}/${pendingAsset}`, admin)).status,
        404,
      );
      assert.equal(
        (await request(`${attachment}/${availableAsset}`, owner)).status,
        404,
      );
      const uploadPath = '/driver/vehicle-verification/assets';
      const uploadDocument = {
        field_key: 'insurance',
        image_upload: {
          file_name: 'insurance.pdf',
          data_url:
            'data:application/pdf;base64,' +
            Buffer.from('%PDF-1.7\n%%EOF\n').toString('base64'),
        },
      };
      const uploadRace = await Promise.all([
        request(uploadPath, driver, 'POST', uploadDocument),
        request(uploadPath, driver, 'POST', uploadDocument),
      ]);
      assert.deepEqual(
        uploadRace.map((upload) => upload.status),
        [200, 200],
      );
      assert.equal(uploadRace[0]!.body.data.id, uploadRace[1]!.body.data.id);
      const unusedAsset = uploadRace[0]!.body.data.id;
      assert.equal(
        (await request(`${uploadPath}/${unusedAsset}`, driver, 'DELETE')).body
          .data.discarded,
        true,
      );
      assert.equal(
        (await request(`${uploadPath}/${availableAsset}`, driver, 'DELETE'))
          .body.data.discarded,
        false,
      );
      await db.query("UPDATE rides SET status='IN_PROGRESS' WHERE id=$1", [
        liveRide,
      ]);
      try {
        assert.equal(
          (
            await request(
              `/driver/vehicle-verification/${vehicleId}`,
              driver,
              'DELETE',
            )
          ).body.error_code,
          'DRIVER_ON_TRIP',
        );
      } finally {
        await db.query("UPDATE rides SET status='CANCELLED' WHERE id=$1", [
          liveRide,
        ]);
      }
      const requestedName = `Driver request ${driver}`;
      const suggested = await request(
        '/driver/vehicle-brands/requests',
        driver,
        'POST',
        { name: requestedName },
      );
      assert.equal(suggested.status, 201);
      const suggestedId = suggested.body.data.id;
      const rejected = await request(
        `/admin/vehicle-brands/${suggestedId}`,
        admin,
        'PATCH',
        {
          name: requestedName,
          status: 'REJECTED',
          rejection_reason: 'Fixture request correction',
          expected_updated_at: suggested.body.data.updated_at,
        },
      );
      assert.equal(rejected.status, 200);
      const corrected = await request(
        `/driver/vehicle-brands/requests/${suggestedId}`,
        driver,
        'PATCH',
        {
          name: requestedName,
          expected_updated_at: rejected.body.data.updated_at,
        },
      );
      assert.equal(corrected.body.data.status, 'REQUESTED');
      const myCatalog = await request('/driver/catalog-requests', driver);
      assert.equal(myCatalog.body.data.brands[0].id, suggestedId);

      const rollbackId = randomUUID();
      const bookingRider = randomUUID();
      await db.query('INSERT INTO users (id,updated_at) VALUES ($1,NOW())', [
        bookingRider,
      ]);
      const riderRepo = app.get(RideRepository);
      const freshQuote = await riderRepo.create_quote(
        bookingRider,
        {
          pickup: { address: 'Fixture pickup', latitude: 25.2, longitude: 87 },
          dropoff: {
            address: 'Fixture dropoff',
            latitude: 25.21,
            longitude: 87.02,
          },
        },
        [
          {
            vehicle_category_id: categoryId,
            vehicle_type: 'SEDAN',
            category_snapshot: {
              capacity: 4,
              payment_policy: { commission_percent: 12.5, cash_enabled: true },
            },
            distance_m: 2500,
            duration_s: 180,
            pickup_eta_s: 10,
            base_fare: 2,
            distance_fare: 9.75,
            time_fare: 0,
            total_fare: 11.75,
          },
        ],
        new Date(Date.now() + 60000),
        [
          [87, 25.2],
          [87.02, 25.21],
        ],
      );
      assert.equal(freshQuote.quotes[0]?.total_fare, '11.75');
      const bookingInput = {
        draft_ride_id: freshQuote.id,
        quote_id: freshQuote.quotes[0]!.id,
        passenger_count: 2,
      };
      await db.query(
        `UPDATE driver_profiles SET current_latitude=25.2004,current_longitude=87.0004,
          last_location_at=NOW(),last_location_accuracy_m=10 WHERE id=$1`,
        [driverProfile],
      );
      const availabilityPath = `/rides/availability?draft_ride_id=${freshQuote.id}&quote_id=${bookingInput.quote_id}&passenger_count=2`;
      const driverAvailability = await request(availabilityPath, bookingRider);
      assert.equal(driverAvailability.status, 200);
      assert.ok(driverAvailability.body.data.items.length);
      assert.equal(
        driverAvailability.body.data.items[0].vehicle.plate_number,
        undefined,
      );
      assert.equal(
        driverAvailability.body.data.items[0].driver.user.phone_e164,
        undefined,
      );
      assert.equal(
        (await request(availabilityPath, owner)).body.error_code,
        'QUOTE_UNAVAILABLE',
      );
      const confirmed = await Promise.all([
        riderRepo.request_ride(bookingRider, bookingInput),
        riderRepo.request_ride(bookingRider, bookingInput),
      ]);
      assert.deepEqual(confirmed.map((result) => result.kind).sort(), [
        'invalid_state',
        'success',
      ]);
      assert.equal(
        (await riderRepo.find_ride_for_user(bookingRider, freshQuote.id))
          ?.events[0]?.event_type,
        'SEARCH_STARTED',
      );
      assert.equal(
        await riderRepo.find_ride_for_user(owner, freshQuote.id),
        null,
      );
      const operations = app.get(DriverOperationsService);
      await Promise.all([
        operations.dispatch(freshQuote.id),
        operations.dispatch(freshQuote.id),
      ]);
      const dispatched = await db.query<{ id: string }>(
        "SELECT id FROM ride_offers WHERE ride_id=$1 AND driver_id=$2 AND status='SENT'",
        [freshQuote.id, driverProfile],
      );
      assert.equal(dispatched.rowCount, 1);
      assert.equal(
        (await driverRepository.accept_offer(driver, dispatched.rows[0]!.id))
          .kind,
        'success',
      );
      assert.equal(
        (await operations.arrive(driver, freshQuote.id)).status,
        'DRIVER_WAITING',
      );
      const riderStart = await operations.context(bookingRider, freshQuote.id);
      assert.ok(riderStart.start.code);
      const wrongCode =
        riderStart.start.code === '000000' ? '111111' : '000000';
      await assert.rejects(
        operations.start_proof(driver, freshQuote.id, wrongCode),
        {
          error_code: 'TRIP_CODE_INVALID',
        },
      );
      assert.equal(
        (
          await db.query(
            'SELECT attempts FROM ride_start_verifications WHERE ride_id=$1',
            [freshQuote.id],
          )
        ).rows[0]?.attempts,
        1,
      );
      assert.equal(
        (await operations.start_proof(bookingRider, freshQuote.id)).status,
        'DRIVER_WAITING',
      );
      assert.equal(
        (
          await operations.start_proof(
            driver,
            freshQuote.id,
            riderStart.start.code,
          )
        ).status,
        'IN_PROGRESS',
      );
      await Promise.all([
        operations.complete(driver, freshQuote.id),
        operations.complete(driver, freshQuote.id),
      ]);
      const completedTrip = await operations.context(
        bookingRider,
        freshQuote.id,
      );
      assert.equal(completedTrip.status, 'COMPLETED');
      assert.equal(completedTrip.payment?.status, 'PENDING');
      assert.equal(completedTrip.trip.final_fare?.toString(), '11.75');
      assert.equal(
        (
          await db.query(
            "SELECT id FROM ride_events WHERE ride_id=$1 AND event_type='TRIP_COMPLETED'",
            [freshQuote.id],
          )
        ).rowCount,
        1,
      );
      const riderReviewInput = {
        reviewee_id: driver,
        score: 4,
        comment: 'Fixture review',
      };
      const recorded = await Promise.all([
        riderRepo.create_review(owner, ride, riderReviewInput),
        riderRepo.create_review(owner, ride, riderReviewInput),
      ]);
      assert.ok(recorded.every((result) => result.kind === 'success'));
      assert.equal(
        (await db.query('SELECT id FROM reviews WHERE ride_id=$1', [ride]))
          .rowCount,
        1,
      );
      assert.equal(
        (
          await db.query(
            'SELECT ratings_count FROM driver_profiles WHERE id=$1',
            [driverProfile],
          )
        ).rows[0]?.ratings_count,
        1,
      );
      const docs = app.get(PartnerDocumentService);
      const kind = `FIXTURE_${admin}`;
      const published = await docs.save(admin, kind, {
        title: 'Fixture policy',
        html: '<p>Published policy</p>',
        revision: 0,
        publish: true,
      });
      assert.equal(published.published_version, 1);
      const draftAfterPublish = await docs.save(admin, kind, {
        title: 'Fixture draft',
        html: '<p>Draft policy</p>',
        revision: 1,
        publish: false,
      });
      assert.equal(draftAfterPublish.revision, 2);
      assert.equal(draftAfterPublish.published_title, 'Fixture policy');
      assert.equal(draftAfterPublish.published_version, 1);
      await assert.rejects(
        docs.save(admin, kind, {
          title: 'Stale',
          html: '<p>Stale</p>',
          revision: 1,
          publish: true,
        }),
        { error_code: 'STALE_DOCUMENT' },
      );
      const lateApplication = randomUUID();
      const deliveryId = randomUUID();
      await db.query(
        `INSERT INTO partner_applications (id,user_id,current_user_id,contact_email,whatsapp_phone,
          policy_snapshot,activation_hash,activation_salt,activation_ciphertext,updated_at)
        VALUES ($1,$2,$2,'fixture@example.test','+15550100000','{}','fixture-hash','fixture-salt','fixture-encrypted',NOW())`,
        [lateApplication, bookingRider],
      );
      await db.query(
        "INSERT INTO partner_deliveries (id,application_id,channel,updated_at) VALUES ($1,$2,'EMAIL',NOW())",
        [deliveryId, lateApplication],
      );
      const deliveryService = app.get(PartnerDeliveryService);
      const applicationPath = '/admin/partner-program/applications';
      const applicationList = await request(
        `${applicationPath}?query=${lateApplication}&pending_only=true&page=999`,
        admin,
      );
      assert.equal(applicationList.status, 200);
      assert.equal(applicationList.body.data.total, 1);
      assert.equal(applicationList.body.data.page, 1);
      assert.equal(applicationList.body.data.rows[0].id, lateApplication);
      const applicationDetail = await request(
        `${applicationPath}/${lateApplication}`,
        admin,
      );
      assert.equal(applicationDetail.status, 200);
      assert.equal(
        applicationDetail.body.data.application.user.id,
        bookingRider,
      );
      assert.equal(
        applicationDetail.body.data.application.activation_hash,
        undefined,
      );
      assert.equal(
        applicationDetail.body.data.application.activation_ciphertext,
        undefined,
      );
      assert.equal(
        applicationDetail.body.data.application.deliveries[0].id,
        deliveryId,
      );
      assert.equal(
        (await request(`${applicationPath}/${lateApplication}`, driver)).status,
        403,
      );
      await Promise.all([
        deliveryService.send_email(lateApplication),
        deliveryService.send_email(lateApplication),
      ]);
      const delivery = (
        await db.query(
          'SELECT status,attempts FROM partner_deliveries WHERE id=$1',
          [deliveryId],
        )
      ).rows[0];
      assert.deepEqual(delivery, { status: 'SKIPPED', attempts: 1 });
      const unrelatedNotice = randomUUID();
      await db.query(
        `INSERT INTO notifications (id,user_id,type,title,body,data,updated_at)
        VALUES ($1,$2,'ACCOUNT','Fixture','Unrelated',
          jsonb_build_object('application_id',$3::text,'route','/partner-program'),NOW()),
          ($4,$2,'ACCOUNT','Fixture','Owned',
          jsonb_build_object('application_id',$5::text,'route','/partner-program'),NOW())`,
        [
          unrelatedNotice,
          bookingRider,
          randomUUID(),
          randomUUID(),
          lateApplication,
        ],
      );
      const deletion = app.get(PartnerApplicationDeletionService);
      const deletionPreview = await deletion.preview(admin, lateApplication);
      assert.equal(deletionPreview.counts.notifications, 1);
      await assert.rejects(
        deletion.remove(admin, lateApplication, {
          version: 2,
          confirmation: 'fixture@example.test',
        }),
        { error_code: 'APPLICATION_CHANGED' },
      );
      const deletedApplication = await deletion.remove(admin, lateApplication, {
        version: 1,
        confirmation: 'fixture@example.test',
      });
      assert.equal(deletedApplication.deleted.deliveries, 1);
      assert.equal(
        (
          await db.query('SELECT id FROM partner_deliveries WHERE id=$1', [
            deliveryId,
          ])
        ).rowCount,
        0,
      );
      assert.equal(
        (await db.query('SELECT id FROM users WHERE id=$1', [bookingRider]))
          .rowCount,
        1,
      );
      assert.equal(
        (
          await db.query('SELECT id FROM notifications WHERE id=$1', [
            unrelatedNotice,
          ])
        ).rowCount,
        1,
      );
      const vehicleVerification = app.get(VehicleVerificationService);
      const documents: Record<string, string> = {};
      for (const key of vehicle_document_keys) {
        const asset = randomUUID();
        documents[key] = asset;
        await db.query(
          `INSERT INTO vehicle_verification_assets (id,owner_id,field_key,file_name,bytes)
            VALUES ($1,$2,$3,$4,$5)`,
          [
            asset,
            registeringDriver,
            key,
            `${key}.webp`,
            Buffer.from('fixture'),
          ],
        );
      }
      const verifiedInput = vehicle_submission.parse({
        registration_key: randomUUID(),
        brand_id: catalogBrandId,
        model_id: enrollmentModels.body.data.rows[0].id,
        vehicle_category_id: categoryId,
        plate_number: `BR01A${randomUUID().replaceAll('-', '').slice(0, 5)}`,
        color: 'Blue',
        documents,
      });
      const vehicleSubmissions = await Promise.all([
        vehicleVerification.submit(registeringDriver, verifiedInput),
        vehicleVerification.submit(registeringDriver, verifiedInput),
      ]);
      const verifiedVehicleId = vehicleSubmissions[0]!.id;
      assert.equal(vehicleSubmissions[1]?.id, verifiedVehicleId);
      let revision = 1;
      for (const field_key of Object.keys(vehicle_labels)) {
        const result = await vehicleVerification.review(
          admin,
          registeringDriver,
          verifiedVehicleId,
          {
            field_key,
            expected_version: revision,
            decision: 'APPROVED',
          },
        );
        assert.equal(result.verification_version, ++revision);
      }
      const verifiedProfile =
        await driverRepository.get_profile_by_user(registeringDriver);
      assert.ok(verifiedProfile);
      assert.equal(
        (
          await db.query(
            'SELECT active_vehicle_id FROM driver_profiles WHERE user_id=$1',
            [registeringDriver],
          )
        ).rows[0]?.active_vehicle_id,
        verifiedVehicleId,
      );
      const renewedAsset = randomUUID();
      await db.query(
        `INSERT INTO vehicle_verification_assets (id,owner_id,field_key,file_name,bytes)
          VALUES ($1,$2,'insurance','renewed.webp',$3)`,
        [renewedAsset, registeringDriver, Buffer.from('fixture')],
      );
      const renewal = {
        expected_version: revision,
        field_key: 'insurance',
        asset_id: renewedAsset,
      };
      assert.equal(
        (
          await vehicleVerification.renew(
            registeringDriver,
            verifiedVehicleId,
            renewal,
          )
        ).version,
        revision + 1,
      );
      assert.equal(
        (
          await vehicleVerification.renew(
            registeringDriver,
            verifiedVehicleId,
            renewal,
          )
        ).version,
        revision + 1,
      );

      const exitApplication = randomUUID();
      await db.query(
        `INSERT INTO partner_applications (id,user_id,current_user_id,status,contact_email,whatsapp_phone,policy_snapshot,activated_at,updated_at)
          VALUES ($1,$2,$2,'ACTIVATED','exit-fixture@example.test','+15550100000','{}',NOW(),NOW())`,
        [exitApplication, registeringDriver],
      );
      const exits = app.get(PartnerExitService);
      const exit = await exits.create(registeringDriver, {
        reason: 'Fixture partner is leaving',
        version: 0,
      });
      assert.equal((await exits.mine(registeringDriver))?.id, exit.id);
      const pendingExits = await exits.list({
        page: 30,
        status: 'PENDING',
        query: exit.id,
      });
      assert.equal(pendingExits.total, 1);
      assert.equal(pendingExits.rows[0]?.id, exit.id);
      const file = {
        file_name: 'fixture-settlement.pdf',
        data_url:
          'data:application/pdf;base64,' +
          Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64'),
      };
      const [exitPdf, replayPdf] = await Promise.all([
        exits.upload(admin, exit.id, file),
        exits.upload(admin, exit.id, file),
      ]);
      assert.equal(exitPdf.id, replayPdf.id);
      const exitReview = {
        status: 'COMPLETED',
        version: exit.version,
        admin_notes: '',
        rejection_reason: '',
        dues_amount: '3.25',
        dues_direction: 'PAYABLE_TO_DRIVER',
        settlement_pdf_id: exitPdf.id,
      } as const;
      await assert.rejects(
        exits.review(admin, exit.id, {
          ...exitReview,
          version: exit.version + 1,
        }),
        {
          error_code: 'EXIT_REQUEST_CHANGED',
        },
      );
      const completedExit = await exits.review(admin, exit.id, exitReview);
      assert.equal(completedExit.status, 'COMPLETED');
      assert.deepEqual(
        (
          await db.query(
            'SELECT role,partner_activated_at FROM users WHERE id=$1',
            [registeringDriver],
          )
        ).rows[0],
        { role: 'RIDER', partner_activated_at: null },
      );
      assert.equal(
        (await exits.history(registeringDriver)).items[0]?.id,
        exit.id,
      );
      assert.equal((await exits.history(owner, exit.id)).items.length, 0);
      assert.equal((await exits.detail(exit.id)).dues_amount, '3.25');
      const riderWallet = randomUUID();
      const driverWallet = randomUUID();
      const failedTopup = randomUUID();
      const postedTopup = randomUUID();
      const topupCredit = randomUUID();
      const cashPayment = randomUUID();
      const driverCredit = randomUUID();
      const largeBalance = '9007199254740993';
      await db.query(
        `INSERT INTO wallets (id,user_id,kind,available_paise)
          VALUES ($1,$2,'RIDER',$3),($4,$5,'DRIVER',1000)`,
        [riderWallet, owner, largeBalance, driverWallet, driver],
      );
      await db.query(
        `INSERT INTO wallet_topups (id,wallet_id,amount_paise,request_key,status,failure_reason,provider_order_id,updated_at)
          VALUES ($1,$2,100,$1,'FAILED','Payment timed out',$3,NOW()),
            ($4,$2,100,$4,'CAPTURED',NULL,NULL,NOW())`,
        [failedTopup, riderWallet, `order_${failedTopup}`, postedTopup],
      );
      await db.query(
        `INSERT INTO wallet_entries (id,wallet_id,kind,available_delta_paise,held_delta_paise,
          available_after_paise,held_after_paise,operation_key,topup_id,commission_paise,commission_percent,external_amount_paise)
          VALUES ($1,$2,'TOP_UP',100,0,$3,0,$1,$4,NULL,NULL,NULL),
            ($5,$6,'RIDE_EARNING',1000,0,1000,0,$5,NULL,100,10,NULL),
            ($7,$6,'CASH_PAYMENT',0,0,1000,0,$7,NULL,25,5,500)`,
        [
          topupCredit,
          riderWallet,
          largeBalance,
          postedTopup,
          driverCredit,
          driverWallet,
          cashPayment,
        ],
      );
      const ledger = await request('/wallet');
      assert.equal(ledger.status, 200);
      assert.equal(ledger.body.data.available_paise, largeBalance);
      assert.equal(
        ledger.body.data.rows[0].available_after_paise,
        largeBalance,
      );
      const timelinePath = `/admin/users/${owner}/wallet-ledger?timeline=true`;
      const timeline = await request(timelinePath, admin);
      assert.equal(timeline.status, 200);
      assert.equal(timeline.body.data.activity.length, 2);
      assert.equal(
        timeline.body.data.activity.find(
          (row: { id: string }) => row.id === failedTopup,
        ).topup.failure_reason,
        'Payment timed out',
      );
      assert.equal(
        timeline.body.data.activity.find(
          (row: { id: string }) => row.id === topupCredit,
        ).topup.id,
        postedTopup,
      );
      const filteredActivity = await request(
        `${timelinePath}&reference=order_${failedTopup}`,
        admin,
      );
      assert.deepEqual(
        filteredActivity.body.data.activity.map(
          (row: { id: string }) => row.id,
        ),
        [failedTopup],
      );
      const driverLedger = await request('/wallet?kind=DRIVER', driver);
      assert.equal(driverLedger.status, 200);
      assert.equal(driverLedger.body.data.payout_available_paise, '975');
      assert.equal(driverLedger.body.data.cash_collected_paise, '500');
      assert.equal(
        driverLedger.body.data.rows.find(
          (row: { id: string }) => row.id === cashPayment,
        ).driver_net_paise,
        '475',
      );
      assert.equal(
        (await request('/wallet?kind=DRIVER', registeringDriver)).status,
        403,
      );
      await operations.payment(bookingRider, freshQuote.id, 'CASH');
      await Promise.all([
        operations.payment(driver, freshQuote.id, 'CASH', { received: true }),
        operations.payment(driver, freshQuote.id, 'CASH', { received: true }),
      ]);
      const cashLedger = await db.query(
        `SELECT w.kind,e.external_amount_paise,e.available_delta_paise,e.commission_paise
          FROM wallet_entries e JOIN wallets w ON w.id=e.wallet_id WHERE e.ride_id=$1
            AND e.kind='CASH_PAYMENT' ORDER BY w.kind DESC`,
        [freshQuote.id],
      );
      assert.equal(cashLedger.rowCount, 2);
      assert.equal(
        cashLedger.rows.find((row) => row.kind === 'DRIVER')?.commission_paise,
        '147',
      );
      assert.equal(
        cashLedger.rows.find((row) => row.kind === 'DRIVER')
          ?.external_amount_paise,
        '1175',
      );
      assert.equal(
        cashLedger.rows.find((row) => row.kind === 'RIDER')
          ?.external_amount_paise,
        '-1175',
      );
      assert.ok(
        cashLedger.rows.every((row) => row.available_delta_paise === '0'),
      );
      const payoutSchedule = randomUUID();
      const payoutCycle = randomUUID();
      const draftPayout = randomUUID();
      await db.query(
        'INSERT INTO payout_schedules (id,updated_at) VALUES ($1,NOW())',
        [payoutSchedule],
      );
      await db.query(
        `INSERT INTO payout_cycles (id,schedule_id,period_start,cutoff_at,scheduled_at,schedule_snapshot)
          VALUES ($1,$2,NOW()-INTERVAL '1 day',NOW(),NOW(),'{}')`,
        [payoutCycle, payoutSchedule],
      );
      const draft = await db.query<{ updated_at: Date }>(
        `INSERT INTO driver_payouts (id,cycle_id,wallet_id,amount_paise,updated_at)
          VALUES ($1,$2,$3,100,NOW()) RETURNING updated_at`,
        [draftPayout, payoutCycle, driverWallet],
      );
      const payoutAdmin = app.get(PayoutAdmin);
      const changePayout = {
        action: 'adjust',
        amount_paise: '35',
        reason: 'Fixture reconciliation',
        reference: '=fixture',
        ride_id: freshQuote.id,
        expected_updated_at: draft.rows[0]!.updated_at.toISOString(),
      } as const;
      const adjusted = await payoutAdmin.edit(admin, draftPayout, changePayout);
      assert.equal(adjusted.amount_paise, '135');
      await assert.rejects(payoutAdmin.edit(admin, draftPayout, changePayout), {
        error_code: 'PAYOUT_CHANGED',
      });
      assert.match((await payoutAdmin.report(payoutCycle)).csv, /"'=fixture"/);
      const excluded = await payoutAdmin.edit(admin, draftPayout, {
        action: 'exclude',
        reason: 'Fixture exclusion',
        expected_updated_at: adjusted.updated_at.toISOString(),
      });
      await payoutAdmin.block(admin, {
        driver_id: driver,
        blocked: true,
        reason: 'Fixture block',
      });
      assert.ok(
        (await payoutAdmin.blocks()).some((row) => row.driver_id === driver),
      );
      const include = {
        action: 'include',
        reason: 'Fixture inclusion',
        expected_updated_at: excluded.updated_at.toISOString(),
      } as const;
      await assert.rejects(payoutAdmin.edit(admin, draftPayout, include), {
        error_code: 'DRIVER_PAYOUT_BLOCKED',
      });
      await payoutAdmin.block(admin, {
        driver_id: driver,
        blocked: false,
        reason: 'Fixture unblock',
      });
      assert.equal(
        (await payoutAdmin.edit(admin, draftPayout, include)).status,
        'DRAFT',
      );
      const payoutMethods = new PayoutMethods(db);
      Object.defineProperty(payoutMethods, 'credentials_ready', {
        get: () => false,
      });
      const payoutDestination = payout_method_input.parse({
        kind: 'BANK_ACCOUNT',
        name: 'Fixture Driver',
        account_number: '001234567890',
        ifsc: 'ABCD0123456',
      });
      const [firstSetup, setupReplay] = await Promise.all([
        payoutMethods.setup(driver, payoutDestination),
        payoutMethods.setup(driver, payoutDestination),
      ]);
      assert.equal(firstSetup.id, setupReplay.id);
      assert.equal(firstSetup.status, 'PENDING');
      assert.equal(firstSetup.is_default, true);
      assert.ok(!JSON.stringify(firstSetup).includes('001234567890'));
      assert.equal(
        (await payoutMethods.check(driver, firstSetup.id)).status,
        'PENDING',
      );
      const pendingFunding = randomUUID();
      const providerOrder = `order_${pendingFunding.replaceAll('-', '')}`;
      const fundingPayment = `pay_${pendingFunding.replaceAll('-', '')}`;
      await db.query(
        `INSERT INTO wallet_topups (id,wallet_id,amount_paise,request_key,status,checkout_kind,provider_mode,
          provider_order_id,updated_at) VALUES ($1,$2,100,$1,'PENDING','SDK','live',$3,NOW())`,
        [pendingFunding, riderWallet, providerOrder],
      );
      let isCaptured = false;
      const fakeProvider = {
        credential_mode: 'live',
        order: async () => ({
          id: providerOrder,
          receipt: pendingFunding,
          amount: 100,
          currency: 'INR',
          amount_paid: isCaptured ? 100 : 0,
          status: isCaptured ? 'paid' : 'created',
        }),
        settled_order_payment: async () =>
          isCaptured
            ? { id: fundingPayment, status: 'captured', amount_refunded: 0 }
            : null,
        payment: async () => ({
          id: fundingPayment,
          order_id: providerOrder,
          amount: 100,
          currency: 'INR',
          status: 'refunded',
          amount_refunded: 100,
        }),
      } as unknown as RazorpayWallet;
      const funding = new WalletTopUps(db, fakeProvider);
      await assert.rejects(funding.check(bookingRider, pendingFunding), {
        error_code: 'TOPUP_NOT_FOUND',
      });
      assert.equal(
        (await funding.check(owner, pendingFunding, true)).status,
        'CANCELLED',
      );
      const secretBefore = config.RAZORPAY_WALLET_WEBHOOK_SECRET;
      const fixtureSecret = 'postgres-local-fixture-webhook';
      config.RAZORPAY_WALLET_WEBHOOK_SECRET = fixtureSecret;
      try {
        isCaptured = true;
        const capture = Buffer.from(
          JSON.stringify({
            event: 'order.paid',
            payload: {
              order: { entity: { id: providerOrder, receipt: pendingFunding } },
            },
          }),
        );
        const captureSignature = createHmac('sha256', fixtureSecret)
          .update(capture)
          .digest('hex');
        const captureId = randomUUID();
        await Promise.all([
          funding.webhook(capture, captureSignature, captureId),
          funding.webhook(capture, captureSignature, captureId),
        ]);
        assert.equal(
          (await funding.check(owner, pendingFunding)).status,
          'CAPTURED',
        );
        const refund = Buffer.from(
          JSON.stringify({
            event: 'refund.processed',
            payload: { refund: { entity: { payment_id: fundingPayment } } },
          }),
        );
        const signature = createHmac('sha256', fixtureSecret)
          .update(refund)
          .digest('hex');
        const refundId = randomUUID();
        await funding.webhook(refund, signature, refundId);
        await funding.webhook(refund, signature, refundId);
        assert.equal(
          (await funding.check(owner, pendingFunding)).status,
          'REFUNDED',
        );
        assert.equal(
          (
            await db.query('SELECT id FROM wallet_entries WHERE topup_id=$1', [
              pendingFunding,
            ])
          ).rowCount,
          2,
        );
        assert.equal(
          (await request('/wallet')).body.data.available_paise,
          largeBalance,
        );
      } finally {
        config.RAZORPAY_WALLET_WEBHOOK_SECRET = secretBefore;
      }
      const upiRide = randomUUID();
      await db.query(
        `INSERT INTO rides (id,rider_id,driver_id,status,pickup_address,pickup_latitude,pickup_longitude,
          dropoff_address,dropoff_latitude,dropoff_longitude,final_fare,completed_at,updated_at)
          VALUES ($1,$2,$3,'COMPLETED','Fixture pickup',25,87,'Fixture dropoff',25.01,87.01,50,NOW(),NOW())`,
        [upiRide, bookingRider, driverProfile],
      );
      await db.query(
        `INSERT INTO fare_quotes (id,ride_id,vehicle_type,distance_m,duration_s,base_fare,distance_fare,
          time_fare,total_fare,expires_at,selected_at,category_snapshot,updated_at)
          VALUES ($1,$2,'SEDAN',1000,60,50,0,0,50,NOW(),NOW(),
            '{"payment_policy":{"direct_upi_enabled":true,"commission_percent":10}}'::jsonb,NOW())`,
        [randomUUID(), upiRide],
      );
      const upiEnabledBefore = (
        await db.query(
          "SELECT razorpay_ride_upi_enabled FROM payout_schedules WHERE id='default'",
        )
      ).rows[0]?.razorpay_ride_upi_enabled;
      await db.query(
        `INSERT INTO payout_schedules (id,razorpay_ride_upi_enabled,updated_at)
          VALUES ('default',true,NOW()) ON CONFLICT(id) DO UPDATE SET razorpay_ride_upi_enabled=true`,
      );
      let upiReceipt = '';
      let upiCaptured = false;
      let refundedPaise = 0;
      let createdOrders = 0;
      const upiOrderId = `order_${upiRide.replaceAll('-', '')}`;
      const savedUpiOrder = () => ({
        id: upiOrderId,
        receipt: upiReceipt,
        amount: 5000,
        currency: 'INR',
        amount_paid: upiCaptured ? 5000 : 0,
        status: upiCaptured ? 'paid' : 'created',
      });
      const upiCheckout = new RideUpi(db, {
        credential_mode: 'live',
        create_order: async (reference: string) => {
          upiReceipt = reference;
          createdOrders++;
          return savedUpiOrder();
        },
        order: async () => savedUpiOrder(),
        payment: async (id: string) => ({
          id,
          order_id: upiOrderId,
          amount: 5000,
          currency: 'INR',
          amount_refunded: refundedPaise,
        }),
        settled_order_payment: async () =>
          upiCaptured
            ? {
                id: `pay_${upiRide.replaceAll('-', '')}`,
                status: 'captured',
                method: 'upi',
                amount_refunded: 0,
              }
            : null,
      } as unknown as RazorpayWallet);
      try {
        assert.equal(
          (await upiCheckout.checkout(bookingRider, upiRide)).status,
          'PENDING',
        );
        assert.equal(
          (await upiCheckout.checkout(bookingRider, upiRide)).status,
          'PENDING',
        );
        assert.equal(createdOrders, 1);
        await assert.rejects(upiCheckout.check(owner, upiRide), {
          error_code: 'PAYMENT_NOT_FOUND',
        });
        upiCaptured = true;
        await Promise.all([
          upiCheckout.check(bookingRider, upiRide),
          upiCheckout.check(driver, upiRide),
        ]);
        const earnings = await db.query(
          "SELECT available_delta_paise,commission_paise FROM wallet_entries WHERE ride_id=$1 AND kind='RIDE_EARNING'",
          [upiRide],
        );
        assert.deepEqual(earnings.rows, [
          { available_delta_paise: '4500', commission_paise: '500' },
        ]);
      } finally {
        await db.query(
          "UPDATE payout_schedules SET razorpay_ride_upi_enabled=$1 WHERE id='default'",
          [upiEnabledBefore ?? false],
        );
      }
      const walletRideId = randomUUID();
      await db.query(
        `INSERT INTO rides (id,rider_id,driver_id,status,pickup_address,pickup_latitude,pickup_longitude,
          dropoff_address,dropoff_latitude,dropoff_longitude,final_fare,completed_at,updated_at)
        VALUES ($1,$2,$3,'COMPLETED','Fixture pickup',25,87,'Fixture destination',25.01,87.01,50,NOW(),NOW())`,
        [walletRideId, owner, driverProfile],
      );
      const walletControlsBefore = (
        await db.query(
          "SELECT wallet_ride_collection_enabled FROM payout_schedules WHERE id='default'",
        )
      ).rows[0]?.wallet_ride_collection_enabled;
      await db.query(
        "UPDATE payout_schedules SET wallet_ride_collection_enabled=true WHERE id='default'",
      );
      const walletRides = app.get(WalletRideRepository);
      try {
        const walletPayments = await Promise.all([
          walletRides.pay_ride(owner, walletRideId),
          walletRides.pay_ride(owner, walletRideId),
        ]);
        assert.equal(walletPayments[0]?.id, walletPayments[1]?.id);
        assert.equal(walletPayments[0]?.status, 'CAPTURED');
        assert.equal(
          (await request('/wallet')).body.data.available_paise,
          String(BigInt(largeBalance) - 5000n),
        );
        await walletRides.refund_ride(
          admin,
          owner,
          walletRideId,
          'Fixture refund',
          false,
        );
        await walletRides.refund_ride(
          admin,
          owner,
          walletRideId,
          'Fixture refund',
          false,
        );
        assert.equal(
          (await request('/wallet')).body.data.available_paise,
          largeBalance,
        );
        assert.equal(
          (
            await db.query(
              "SELECT id FROM wallet_entries WHERE ride_id=$1 AND kind='REFUND'",
              [walletRideId],
            )
          ).rowCount,
          2,
        );
      } finally {
        await db.query(
          "UPDATE payout_schedules SET wallet_ride_collection_enabled=$1 WHERE id='default'",
          [walletControlsBefore ?? false],
        );
      }
      const payouts = app.get(WalletRepository);
      const scheduleBefore = await payouts.schedule();
      const dueAt = new Date(Date.now() + 60_000);
      try {
        await payouts.save_schedule(admin, {
          expected_version: scheduleBefore.version,
          enabled: true,
          frequency: 'DAILY',
          minute_of_day_ist: 300,
          weekday_ist: 1,
          month_day_ist: 1,
          minimum_paise: '0',
          require_approval: true,
          next_run_override: dueAt.toISOString(),
        });
        const prepared = await payouts.prepare_due_cycle(dueAt);
        assert.equal(prepared.prepared, true);
        const preparedId = prepared.cycle_id!;
        const cycleDrivers = await payouts.cycle_drivers(preparedId, 1, 50);
        const draftLines = await db.query(
          `SELECT l.amount_paise,l.ride_id FROM driver_payout_lines l
            JOIN driver_payouts p ON p.id=l.payout_id WHERE p.wallet_id=$1 AND p.cycle_id=$2`,
          [driverWallet, preparedId],
        );
        assert.ok(cycleDrivers.rows.length);
        assert.equal(
          draftLines.rows.find((line) => line.ride_id === freshQuote.id)
            ?.amount_paise,
          '-147',
        );
        assert.equal(
          draftLines.rows.find((line) => line.ride_id === upiRide)
            ?.amount_paise,
          '4500',
        );
        assert.equal((await payouts.prepare_due_cycle(dueAt)).prepared, false);

        const {
          rows: [transfer],
        } = await db.query<{ id: string; amount_paise: string }>(
          'SELECT id,amount_paise::text FROM driver_payouts WHERE cycle_id=$1 AND wallet_id=$2',
          [preparedId, driverWallet],
        );
        assert.ok(transfer && BigInt(transfer.amount_paise) > 100n);
        const fundAccount = 'fa_' + transfer.id.replaceAll('-', '');
        await db.query(
          "UPDATE driver_payout_methods SET status='VERIFIED',provider_fund_account_id=$2,pending_details=NULL WHERE id=$1",
          [firstSetup.id, fundAccount],
        );
        await db.query(
          "UPDATE driver_payouts SET updated_at='2000-01-01T00:00:00Z' WHERE id=$1",
          [transfer.id],
        );
        await db.query(
          "UPDATE payout_schedules SET razorpay_x_transfers_enabled=true WHERE id='default'",
          [],
        );
        const worker = new PayoutTransfer(db, payoutMethods);
        Object.defineProperty(worker, 'credentials_ready', { get: () => true });
        const {
          rows: [draftCycle],
        } = await db.query<{ version: number }>(
          'SELECT version FROM payout_cycles WHERE id=$1',
          [preparedId],
        );
        await worker.approve(admin, preparedId, draftCycle!.version);
        await assert.rejects(
          worker.approve(admin, preparedId, draftCycle!.version),
          { error_code: 'PAYOUT_CYCLE_CHANGED' },
        );
        const oldSource = config.RAZORPAY_X_SOURCE_ACCOUNT;
        let requests = 0;
        const mockedTransfer = t.mock.method(
          globalThis,
          'fetch',
          async (url: string, options: RequestInit) => {
            assert.equal(url, 'https://api.razorpay.com/v1/payouts');
            assert.equal(options.method, 'POST');
            const body = JSON.parse(String(options.body));
            assert.equal(body.reference_id, transfer.id);
            assert.equal(body.amount, Number(transfer.amount_paise));
            assert.equal(body.mode, 'IMPS');
            assert.ok(new Headers(options.headers).get('X-Payout-Idempotency'));
            requests++;
            return Response.json({
              id: 'pout_' + transfer.id.replaceAll('-', ''),
              fund_account_id: fundAccount,
              reference_id: transfer.id,
              mode: 'IMPS',
              amount: body.amount,
              currency: 'INR',
              status: 'processed',
            });
          },
        );
        try {
          config.RAZORPAY_X_SOURCE_ACCOUNT = 'fixture-source';
          await worker.tick();
          await worker.tick();
          assert.equal(requests, 1);
        } finally {
          mockedTransfer.mock.restore();
          config.RAZORPAY_X_SOURCE_ACCOUNT = oldSource;
        }
        assert.deepEqual(
          (
            await db.query('SELECT status FROM driver_payouts WHERE id=$1', [
              transfer.id,
            ])
          ).rows,
          [{ status: 'PAID' }],
        );
        assert.deepEqual(
          (
            await db.query(
              "SELECT kind,held_delta_paise FROM wallet_entries WHERE payout_id=$1 AND kind IN ('PAYOUT_HOLD','PAYOUT_SETTLED') ORDER BY kind",
              [transfer.id],
            )
          ).rows,
          [
            { kind: 'PAYOUT_HOLD', held_delta_paise: transfer.amount_paise },
            {
              kind: 'PAYOUT_SETTLED',
              held_delta_paise: '-' + transfer.amount_paise,
            },
          ],
        );
      } finally {
        await db.query(
          "UPDATE payout_schedules SET enabled=$1,next_run_at=$2,razorpay_x_transfers_enabled=$3 WHERE id='default'",
          [
            scheduleBefore.enabled,
            scheduleBefore.planned_next_run_at,
            scheduleBefore.razorpay_x_transfers_enabled,
          ],
        );
      }

      const partner = app.get(PartnerProgramService);
      const applicant = randomUUID();
      await db.query('INSERT INTO users(id,updated_at) VALUES($1,now())', [
        applicant,
      ]);
      const partnerDocuments = app.get(PartnerDocumentService);
      const publishFixture = async (kind: 'POLICY' | 'CONFIRMATION') => {
        const current = await partnerDocuments.get(kind);
        return partnerDocuments.save(admin, kind, {
          title: 'Fixture ' + kind,
          html: '<p>Published test terms.</p>',
          revision: current?.revision ?? 0,
          publish: true,
        });
      };
      const policy = await publishFixture('POLICY');
      const confirmation = await publishFixture('CONFIRMATION');
      assert.ok(policy.published_version && confirmation.published_version);
      const onboarding = await partner.workflow(applicant);
      const selfieImage = await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: '#2d446a',
        },
      })
        .png()
        .toBuffer();
      const selfie = await partner.store_asset(applicant, {
        field_id: LIVE_SELFIE_ID,
        file_name: 'selfie.png',
        capture_source: 'CAMERA',
        data_url: 'data:image/png;base64,' + selfieImage.toString('base64'),
      });
      const submission = await partner.submit(applicant, {
        version: 0,
        policy_version: policy.published_version,
        accepted: true,
        contact_email: 'partner-pilot@example.test',
        whatsapp_phone: '+919111110010',
        answers: onboarding.requirements
          .filter((field) => field.id === LIVE_SELFIE_ID)
          .map((field) => ({ requirement_id: field.id, value: [selfie.id] })),
      });
      const reviewState = await partner.workflow(applicant);
      const submittedSelfie = reviewState.application?.fields.find(
        (field) => field.requirement_id === LIVE_SELFIE_ID,
      );
      assert.ok(submittedSelfie);
      assert.equal(
        submittedSelfie.value instanceof Array && submittedSelfie.value[0],
        selfie.id,
      );
      const fieldReview = await partner.review_field(
        admin,
        submission.id,
        submittedSelfie.id,
        {
          decision: 'APPROVED',
          version: submission.version,
        },
      );
      const approved = await partner.approve_application(admin, submission.id, {
        decision: 'APPROVED',
        version: fieldReview.version,
      });
      const partnerConfirmed = await partner.confirm(applicant, {
        version: approved.version,
        document_version: confirmation.published_version,
        signature_name: 'Fixture Driver',
        accepted: true,
      });
      const finalPdf = await partner.store_asset(
        admin,
        {
          application_id: submission.id,
          file_name: 'agreement.pdf',
          data_url:
            'data:application/pdf;base64,' +
            Buffer.from('%PDF-1.4\n%%EOF').toString('base64'),
        },
        true,
      );
      await assert.rejects(partner.asset(applicant, finalPdf.id), {
        error_code: 'FILE_NOT_FOUND',
      });
      const reviewed = await partner.review_confirmation(admin, submission.id, {
        version: partnerConfirmed.version,
        decision: 'APPROVED',
        final_pdf_id: finalPdf.id,
      });
      assert.equal(reviewed.status, 'COMPLETED');
      assert.equal(
        (await partner.asset(applicant, finalPdf.id)).id,
        finalPdf.id,
      );
      const activation = create_activation();
      await db.query(
        'UPDATE partner_applications SET activation_hash=$2,activation_salt=$3,activation_ciphertext=$4,activation_issued_at=NOW() WHERE id=$1',
        [
          submission.id,
          activation.activation_hash,
          activation.activation_salt,
          activation.activation_ciphertext,
        ],
      );
      await partner.queue_activation_email(admin, submission.id);
      await partner.mark_activation_shared(admin, submission.id);
      await partner.mark_shared(admin, submission.id);
      const code = reveal_activation(activation.activation_ciphertext)!;
      await assert.rejects(
        partner.activate(applicant, code === '000000' ? '111111' : '000000'),
        { error_code: 'ACTIVATION_FAILED' },
      );
      assert.equal(
        (await partner.activation_code(admin, submission.id)).attempts,
        1,
      );
      assert.equal(
        (await partner.activate(applicant, code)).status,
        'ACTIVATED',
      );
      assert.equal(
        (await partner.activate(applicant, code)).status,
        'ACTIVATED',
      );
      assert.deepEqual(
        (await db.query('SELECT role FROM users WHERE id=$1', [applicant]))
          .rows,
        [{ role: 'DRIVER' }],
      );
      const partnerEmails = await db.query(
        "SELECT data->>'event' AS event FROM notifications WHERE data->>'application_id'=$1 AND channel='EMAIL'",
        [submission.id],
      );
      assert.ok(
        partnerEmails.rows.some((row) => row.event === 'APPLICATION_RECEIVED'),
      );

      const upiPaymentId = 'pay_' + upiRide.replaceAll('-', '');
      const verifyRefund = () =>
        db.query<{ status: string }>(
          'SELECT status FROM payments WHERE provider_payment_id=$1',
          [upiPaymentId],
        );
      refundedPaise = 1000;
      await upiCheckout.flag_refund_or_dispute(
        upiPaymentId,
        'refund.processed',
        randomUUID(),
      );
      assert.equal(
        (await verifyRefund()).rows[0]?.status,
        'PARTIALLY_REFUNDED',
      );
      refundedPaise = 5000;
      await upiCheckout.flag_refund_or_dispute(
        upiPaymentId,
        'refund.processed',
        randomUUID(),
      );
      refundedPaise = 1000;
      await upiCheckout.flag_refund_or_dispute(
        upiPaymentId,
        'refund.processed',
        randomUUID(),
      );
      assert.equal((await verifyRefund()).rows[0]?.status, 'REFUNDED');

      await assert.rejects(
        db.transaction(async (tx) => {
          await tx.query(
            'INSERT INTO users (id, updated_at) VALUES ($1, NOW())',
            [rollbackId],
          );
          throw new Error('rollback regression');
        }),
        /rollback regression/,
      );
      assert.equal(
        (await db.query('SELECT id FROM users WHERE id = $1', [rollbackId]))
          .rowCount,
        0,
      );
      await assert.rejects(
        db.transaction(async (tx) => {
          const outcomes = await Promise.allSettled([
            tx.query('SELECT 1 / 0'),
            tx.query('INSERT INTO users (id, updated_at) VALUES ($1, NOW())', [
              rollbackId,
            ]),
          ]);
          assert.deepEqual(
            outcomes.map((outcome) => outcome.status),
            ['rejected', 'rejected'],
          );
        }),
        /22012/,
      );
      assert.equal(
        (await db.query('SELECT id FROM users WHERE id=$1', [rollbackId]))
          .rowCount,
        0,
      );
    } finally {
      await app.close();
    }
  },
);
