import type { PostgresService } from '../database/postgres.service.js';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import { PartnerProgramService } from '../features/partner_program/partner_program.service.js';
import { PartnerExitService } from '../features/partner_program/partner_exit.service.js';
import { clean_document } from '../features/partner_program/partner_document.service.js';
import {
  create_activation,
  matches_activation,
  reveal_activation,
} from '../features/partner_program/partner_program.security.js';
import { AppError } from '../core/error.js';
import { AuthRepository } from '../features/auth/auth.repo.js';
import { PartnerRequirementRepository } from '../features/partner_requirement/partner_requirement.repo.js';
import {
  requirement_input,
  category_input,
} from '../features/partner_requirement/partner_requirement.type.js';

type Answer = {
  id: string;
  requirement_id: string;
  status: string;
  value: unknown;
  definition: {
    id: string;
    label: string;
    field_type: string;
    is_required: boolean;
    max_file_size_mb?: number;
    allowed_extensions?: string[];
  };
};
function fixture() {
  const state = {
    role: 'RIDER',
    committed: 0,
    driverWrites: 0,
    assetReads: 0,
    losePromotion: false,
    publishedConfirmation: false,
    returning: false,
    requirements: [] as Answer['definition'][],
    resumedOffline: false,
    newApplication: null as Record<string, unknown> | null,
    newFields: [] as Record<string, unknown>[],
    onPartnerLock: () => {},
  };
  const app = {
    id: 'fixture-application',
    user_id: 'fixture-rider',
    current_user_id: 'fixture-rider' as string | null,
    contact_email: 'rider@example.test',
    whatsapp_phone: '+919876543210',
    status: 'COMPLETED',
    version: 1,
    policy_snapshot: {
      title: 'Policy',
      html: '<p>Accepted policy</p>',
      version: 1,
    },
    fields: [] as Answer[],
    ...create_activation(),
    final_pdf_id: null as string | null,
    activation_issued_at: null as Date | null,
  };
  const audits: Record<string, unknown>[] = [];
  const queuedEmails: Record<string, unknown>[] = [];
  let assetRows: {
    id: string;
    owner_id: string;
    application_id?: string | null;
    purpose: string;
    field_id: string;
    file_name: string;
    mime_type: string;
    size: number;
  }[] = [];
  const query = async (sql: string, args: unknown[] = []) => {
    const result = (rows: unknown[] = [], rowCount = rows.length) => ({
      rows,
      rowCount,
    });
    if (sql.includes('pg_advisory_xact_lock(720061')) state.onPartnerLock();
    if (sql.includes('email IS NOT NULL'))
      return result([{ id: 'fixture-admin', email: 'admin@example.test' }]);
    if (sql.includes('FROM users WHERE'))
      return result([
        {
          role: args[0] === 'fixture-admin' ? 'ADMIN' : state.role,
          status: 'ACTIVE',
          deleted_at: null,
        },
      ]);
    if (sql.includes('UPDATE users SET role=')) {
      if (state.losePromotion) state.role = 'ADMIN';
      if (state.role !== args[1]) return result();
      if (state.role === 'RIDER') state.role = 'DRIVER';
      return result([], 1);
    }
    if (sql.includes('INSERT INTO driver_profiles')) state.driverWrites++;
    if (sql.includes("UPDATE driver_profiles SET availability='OFFLINE'"))
      state.resumedOffline = state.returning;
    if (sql.includes('FROM partner_applications a WHERE'))
      return result([{ ...app }]);
    if (sql.includes('FROM partner_requirements'))
      return result(state.requirements);
    if (sql.includes('FROM partner_documents'))
      return result(
        state.publishedConfirmation
          ? [
              {
                title: 'Confirmation',
                published_title: 'Confirmation',
                published_html: '<p>Accepted terms</p>',
                published_version: 1,
                published_at: new Date(),
              },
            ]
          : [],
      );
    if (sql.includes('FROM partner_assets WHERE owner_id')) {
      state.assetReads++;
      return result(
        assetRows.filter(
          (asset) =>
            asset.owner_id === args[0] &&
            (asset.application_id === undefined ||
              asset.application_id === args[1]) &&
            (!Array.isArray(args[2]) || args[2].includes(asset.id)) &&
            (!args[3] || args[3] === asset.field_id) &&
            (!args[4] || args[4] === asset.purpose),
        ),
      );
    }
    if (sql.includes('FROM partner_assets a JOIN users')) {
      const row = assetRows.find((asset) => asset.id === args[1]);
      return result(
        row &&
          (args[0] === 'fixture-admin' ||
            (args[0] === row.owner_id &&
              (row.purpose !== 'FINAL_PDF' ||
                (app.final_pdf_id === row.id &&
                  ['COMPLETED', 'ACTIVATED', 'EXITED'].includes(app.status)))))
          ? [row]
          : [],
      );
    }
    if (sql.includes('UPDATE partner_assets SET application_id')) {
      for (const asset of assetRows)
        if (asset.application_id === null)
          asset.application_id = String(args[1]);
    }
    if (sql.includes('INSERT INTO partner_applications')) {
      state.newApplication = {
        id: 'fresh-application',
        user_id: args[1],
        current_user_id: args[1],
        contact_email: args[2],
        whatsapp_phone: args[3],
        policy_snapshot: JSON.parse(String(args[4])),
        status: 'SUBMITTED',
        version: 1,
      };
      return result([state.newApplication]);
    }
    if (sql.includes('INSERT INTO partner_application_fields')) {
      state.newFields = JSON.parse(String(args[1]));
    }
    if (sql.includes('UPDATE partner_applications SET')) {
      if (sql.includes('current_user_id=NULL')) app.current_user_id = null;
      if (sql.includes('activation_attempts=activation_attempts+1'))
        app.activation_attempts++;
      if (sql.includes('version=version+1')) app.version++;
      if (sql.includes("status='ACTIVATED'"))
        Object.assign(app, {
          status: 'ACTIVATED',
          activation_hash: null,
          activation_salt: null,
          activation_ciphertext: null,
        });
      if (sql.includes("status='APPROVED'")) app.status = 'APPROVED';
      if (sql.includes("status='SUBMITTED'")) app.status = 'SUBMITTED';
      if (sql.includes('status=$2::')) app.status = String(args[1]);
      return result([app]);
    }
    if (sql.includes('INSERT INTO user_logs'))
      audits.push({
        actor_id: args[1],
        entity_type: args[2],
        entity_id: args[3],
        action: args[4],
        after_data: JSON.parse(String(args[6])),
      });
    if (
      sql.includes('INSERT INTO notifications') &&
      sql.includes('jsonb_to_recordset')
    )
      queuedEmails.push(...JSON.parse(String(args[0])));
    return result();
  };
  const database = {
    query,
    transaction: async (
      action: (tx: { query: typeof query }) => Promise<unknown>,
    ) => {
      const result = await action({ query });
      state.committed++;
      return result;
    },
  } as unknown as PostgresService;
  return {
    service: new PartnerProgramService(database),
    state,
    app,
    audits,
    queuedEmails,
    setAssets: (rows: typeof assetRows) => {
      assetRows = rows;
    },
  };
}
const errorCode = (code: string) => (error: unknown) =>
  error instanceof AppError && error.error_code === code;

it('returns a fresh onboarding form with only compatible approved values from the previous exit', async () => {
  const f = fixture();
  f.app.status = 'EXITED';
  f.state.publishedConfirmation = true;
  const fields = [
    { id: 'name', field_type: 'STRING', value: 'Driver Name' },
    { id: 'selfie', field_type: 'IMAGE', value: ['private-old-selfie'] },
    { id: 'updated', field_type: 'STRING', value: 'previous text' },
    { id: 'restricted', field_type: 'STRING', value: 'too long' },
  ];
  for (const field of fields) {
    const definition = {
      id: field.id,
      label: field.id,
      field_type: field.field_type,
      is_required: true,
    };
    f.app.fields.push({
      id: field.id,
      requirement_id: field.id,
      status: 'APPROVED',
      value: field.value,
      definition,
    });
    f.state.requirements.push({
      ...definition,
      ...(field.id === 'updated' ? { field_type: 'DATE' } : {}),
      ...(field.id === 'restricted' ? { max_length: 2 } : {}),
    });
  }
  f.app.policy_snapshot.version = 7;
  const workflow = await f.service.workflow('fixture-rider');
  assert.equal(workflow.application, null);
  assert.ok(
    workflow.policy &&
      typeof workflow.policy === 'object' &&
      'version' in workflow.policy,
  );
  assert.equal(workflow.policy.version, 1);
  assert.equal(workflow.reapplication?.previous_application_id, f.app.id);
  assert.equal(workflow.reapplication?.whatsapp_phone, '+919876543210');
  assert.deepEqual(workflow.reapplication?.fields, { name: 'Driver Name' });
  assert.ok(
    workflow.requirements.some((field) => field.id === '__live_selfie__'),
  );
  assert.equal(workflow.driver_active, false);
});

it('keeps the exited application and rejects its old selfie when creating a new application', async () => {
  const f = fixture();
  f.app.status = 'EXITED';
  f.state.publishedConfirmation = true;
  f.app.policy_snapshot.version = 7;
  const oldSelfie = {
    id: 'selfie-old',
    application_id: f.app.id,
    owner_id: f.app.user_id,
    field_id: '__live_selfie__',
    purpose: 'APPLICATION_SELFIE',
    file_name: 'selfie.webp',
    mime_type: 'image/webp',
    size: 800,
  };
  const freshSelfie = {
    ...oldSelfie,
    id: 'selfie-new',
    application_id: null as string | null,
  };
  f.setAssets([oldSelfie, freshSelfie]);
  const input = {
    version: 0,
    policy_version: 1,
    accepted: true as const,
    contact_email: f.app.contact_email,
    whatsapp_phone: f.app.whatsapp_phone,
    answers: [{ requirement_id: '__live_selfie__', value: [oldSelfie.id] }],
  };
  await assert.rejects(
    f.service.submit(f.app.user_id, input),
    errorCode('PARTNER_VALIDATION_ERROR'),
  );
  assert.equal(f.app.current_user_id, f.app.user_id);
  assert.equal(f.state.newApplication, null);
  input.answers[0]!.value = [freshSelfie.id];
  const receipt = await f.service.submit(f.app.user_id, input);
  assert.deepEqual(receipt, {
    id: 'fresh-application',
    status: 'SUBMITTED',
    version: 1,
  });
  assert.equal(f.app.status, 'EXITED');
  assert.equal(f.app.current_user_id, null);
  assert.equal(f.app.policy_snapshot.version, 7);
  assert.equal(oldSelfie.application_id, f.app.id);
  assert.equal(freshSelfie.application_id, receipt.id);
  assert.equal(f.state.newFields[0]?.status, undefined);
});

it('starts a returning driver offline only after the new activation code succeeds', async () => {
  const f = fixture();
  f.state.returning = true;
  const code = reveal_activation(f.app.activation_ciphertext!);
  await assert.rejects(
    f.service.activate(
      'fixture-rider',
      code === '000000' ? '111111' : '000000',
    ),
    errorCode('ACTIVATION_FAILED'),
  );
  assert.equal(f.state.resumedOffline, false);
  await f.service.activate('fixture-rider', code);
  assert.equal(f.state.resumedOffline, true);
  assert.equal(f.app.status, 'ACTIVATED');
});

for (const role of ['DRIVER', 'ADMIN', 'SUPPORT'] as const) {
  it(`completes an exit and clears driving access for a ${role} account`, async () => {
    const updates: unknown[] = [];
    let active = true;
    const exit = {
      id: 'exit',
      application_id: 'application',
      status: 'REVIEWING',
      version: 2,
    };
    const tx = {
      query: async (sql: string, values: unknown[] = []) => {
        const rows: unknown[] = [];
        if (sql.includes('FROM users WHERE'))
          rows.push({
            status: 'ACTIVE',
            deleted_at: null,
            role: values[0] === 'admin' ? 'ADMIN' : role,
          });
        if (
          sql.includes('a.user_id') &&
          sql.includes('FROM partner_exit_requests')
        )
          rows.push({ ...exit, user_id: 'owner' });
        if (sql.startsWith('SELECT e.*')) rows.push(exit);
        if (sql.startsWith('SELECT status FROM partner_applications'))
          rows.push({ status: 'ACTIVATED' });
        if (sql.includes('FROM partner_assets')) rows.push({ id: 'pdf' });
        if (sql.includes('FROM driver_profiles')) rows.push({ id: 'profile' });
        if (sql.includes('FROM rides') && active)
          rows.push({ id: 'live-ride' });
        if (sql.startsWith('UPDATE users')) {
          assert.match(
            sql,
            /role=CASE WHEN role='DRIVER' THEN 'RIDER' ELSE role END/,
          );
          assert.match(sql, /partner_activated_at=NULL/);
          updates.push(values);
        }
        if (sql.startsWith('UPDATE partner_exit_requests'))
          rows.push({ ...exit, status: 'COMPLETED' });
        return { rows, rowCount: rows.length };
      },
    };
    const service = new PartnerExitService({
      transaction: (work: (client: typeof tx) => unknown) => work(tx),
    } as unknown as PostgresService);
    const input = {
      version: 2,
      status: 'COMPLETED',
      admin_notes: '',
      rejection_reason: '',
      dues_amount: '0',
      dues_direction: 'SETTLED',
      settlement_pdf_id: 'pdf',
    } as const;
    await assert.rejects(
      service.review('admin', 'exit', input),
      errorCode('DRIVER_ON_TRIP'),
    );
    assert.deepEqual(updates, []);
    active = false;
    assert.equal(
      (await service.review('admin', 'exit', input)).status,
      'COMPLETED',
    );
    assert.deepEqual(updates, [['owner']]);
  });
}

it('confirmation alerts use the committed status rather than the pre-submit snapshot', async () => {
  const f = fixture();
  Object.assign(f.app, {
    status: 'APPROVED',
    confirmation_document: { version: 1 },
  });
  await f.service.confirm('fixture-rider', {
    version: 1,
    document_version: 1,
    signature_name: 'Fixture Name',
    accepted: true,
  });
  assert.equal(f.app.status, 'CONFIRMATION_SUBMITTED');
  assert.equal(f.queuedEmails.length, 1);
  const data = f.queuedEmails[0]!.data as Record<string, unknown>;
  assert.equal(data.expected_status, 'CONFIRMATION_SUBMITTED');
  assert.equal(data.version, 2);
  assert.equal(data.recipient_role, 'ADMIN');
});

for (const operation of ['create-field', 'enable-category'] as const) {
  it(`configuration cannot exceed the application's field limit through ${operation}`, async () => {
    const changedAt = new Date('2026-10-18T00:00:00.000Z');
    const tx = {
      query: async (sql: string) => {
        if (sql.includes('FROM users'))
          return {
            rows: [{ role: 'ADMIN', status: 'ACTIVE', deleted_at: null }],
          };
        if (sql.includes('count(*)'))
          return {
            rows: [{ total: operation === 'create-field' ? 200 : 201 }],
          };
        if (sql.startsWith('SELECT * FROM requirement_categories'))
          return {
            rows: [
              {
                id: 'category',
                is_active: operation === 'create-field',
                updated_at: changedAt,
              },
            ],
          };
        return { rows: [] };
      },
    };
    const database = {
      transaction: (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx),
    } as unknown as PostgresService;
    const repository = new PartnerRequirementRepository(database);
    const action =
      operation === 'create-field'
        ? repository.save_field(
            'fixture-admin',
            requirement_input.parse({
              category_id: 'category',
              key: 'legal_name',
              label: 'Legal name',
              field_type: 'STRING',
            }),
          )
        : repository.save_category(
            'fixture-admin',
            {
              ...category_input.parse({ name: 'Category', is_active: true }),
              expected_updated_at: changedAt.toISOString(),
            },
            'category',
          );
    await assert.rejects(action, errorCode('PARTNER_FIELD_LIMIT'));
  });
}

it('only the first fresh login after final approval generates an activation code', async () => {
  const f = fixture();
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM users'))
      return { rows: [{ role: 'RIDER', status: 'ACTIVE', deleted_at: null }] };
    if (sql.includes('FROM partner_applications')) return { rows: [f.app] };
    if (sql.startsWith('INSERT INTO sessions'))
      return { rows: [{ id: params[0] }] };
    if (sql.startsWith('UPDATE partner_applications')) {
      Object.assign(f.app, {
        activation_hash: params[1],
        activation_salt: params[2],
        activation_ciphertext: params[3],
        activation_attempts: params[4],
        activation_issued_at: params[5],
      });
    }
    if (sql.includes('INSERT INTO user_logs'))
      f.audits.push({ action: String(params[4]) });
    return { rows: [] };
  };
  const auth = new AuthRepository({
    transaction: (work: (tx: { query: typeof query }) => Promise<unknown>) =>
      work({ query }),
  } as unknown as PostgresService);

  await auth.create_session(
    f.app.user_id,
    'fixture-refresh-hash',
    new Date(Date.now() + 60000),
    undefined,
    undefined,
  );
  const issued = f.app.activation_issued_at;
  const encrypted = f.app.activation_ciphertext;
  assert(issued instanceof Date);
  await auth.create_session(
    f.app.user_id,
    'fixture-next-hash',
    new Date(Date.now() + 60000),
    undefined,
    undefined,
  );
  assert.equal(f.app.activation_issued_at, issued);
  assert.equal(f.app.activation_ciphertext, encrypted);
  assert.equal(
    f.audits.filter(
      (log) => log.action === 'GENERATE_PARTNER_ACTIVATION_ON_FIRST_LOGIN',
    ).length,
    1,
  );
});

it('activation retains an encrypted, salted, verifiable code without an expiry', () => {
  const activation = create_activation();
  const code = reveal_activation(activation.activation_ciphertext);
  assert.match(code, /^\d{6}$/);
  assert(
    matches_activation(
      code,
      activation.activation_salt,
      activation.activation_hash,
    ),
  );
  assert(
    !matches_activation(
      'not-the-code',
      activation.activation_salt,
      activation.activation_hash,
    ),
  );
  assert(!('activation_expires_at' in activation));
  assert.notEqual(activation.activation_hash, code);
  const encrypted = activation.activation_ciphertext.split('.');
  encrypted[2] =
    (encrypted[2]!.startsWith('0') ? '1' : '0') + encrypted[2]!.slice(1);
  assert.throws(
    () => reveal_activation(encrypted.join('.')),
    errorCode('ACTIVATION_KEY_CHANGED'),
  );
});

it('wrong activation attempts commit and lock after five failures', async () => {
  const f = fixture();
  const actual = reveal_activation(f.app.activation_ciphertext);
  const wrong = actual === '123456' ? '654321' : '123456';
  for (let attempt = 1; attempt <= 5; attempt++) {
    await assert.rejects(
      f.service.activate(f.app.user_id, wrong),
      errorCode('ACTIVATION_FAILED'),
    );
    assert.equal(f.app.activation_attempts, attempt);
    assert.equal(f.state.committed, attempt);
  }
  await assert.rejects(
    f.service.activate(f.app.user_id, actual),
    errorCode('ACTIVATION_FAILED'),
  );
  assert.equal(f.state.role, 'RIDER');
  assert.equal(f.state.driverWrites, 0);
  assert.equal(f.app.activation_attempts, 5);
  assert.equal(f.audits.length, 5);
});

it('activation consumes code material once and allows an idempotent retry', async () => {
  const f = fixture();
  const actual = reveal_activation(f.app.activation_ciphertext);
  await f.service.activate(f.app.user_id, actual);
  assert.equal(f.app.status, 'ACTIVATED');
  assert.equal(f.app.activation_hash, null);
  assert.equal(f.app.activation_salt, null);
  assert.equal(f.app.activation_ciphertext, null);
  await f.service.activate(f.app.user_id, actual);
  assert.equal(f.state.driverWrites, 1);
});

it('activation rechecks the role after a concurrent verification completes', async () => {
  const f = fixture();
  f.state.onPartnerLock = () => {
    f.state.role = 'DRIVER';
    f.app.status = 'ACTIVATED';
  };
  assert.deepEqual(await f.service.activate(f.app.user_id, '123456'), {
    status: 'ACTIVATED',
  });
  assert.equal(f.state.driverWrites, 0);
});

it('activation cannot overwrite a concurrently granted administrator role', async () => {
  const f = fixture();
  f.state.losePromotion = true;
  await assert.rejects(
    f.service.activate(
      f.app.user_id,
      reveal_activation(f.app.activation_ciphertext),
    ),
    errorCode('ACTIVATION_FAILED'),
  );
  assert.equal(f.state.role, 'ADMIN');
  assert.equal(f.state.driverWrites, 0);
  assert.equal(f.app.status, 'COMPLETED');
  assert.notEqual(f.app.activation_hash, null);
});

it('application approval commits an actor, target and safe status/version audit snapshot', async () => {
  const f = fixture();
  f.app.status = 'SUBMITTED';
  f.state.publishedConfirmation = true;
  f.app.fields = [
    {
      id: 'selfie-answer',
      requirement_id: '__live_selfie__',
      status: 'APPROVED',
      value: ['selfie'],
      definition: {
        id: '__live_selfie__',
        label: 'Live selfie',
        field_type: 'IMAGE',
        is_required: true,
      },
    },
  ];
  f.setAssets([
    {
      id: 'selfie',
      owner_id: f.app.user_id,
      purpose: 'APPLICATION_SELFIE',
      field_id: '__live_selfie__',
      file_name: 'selfie.webp',
      mime_type: 'image/webp',
      size: 100,
    },
  ]);
  await f.service.approve_application('fixture-admin', f.app.id, {
    version: 1,
    decision: 'APPROVED',
  });
  assert.equal(f.state.committed, 1);
  const log = f.audits.find(
    (row) => row.action === 'APPROVE_PARTNER_APPLICATION',
  )!;
  assert.equal(log.actor_id, 'fixture-admin');
  assert.equal(log.entity_id, f.app.id);
  assert.deepEqual(log.after_data, {
    previous_status: 'SUBMITTED',
    status: 'APPROVED',
    previous_version: 1,
    version: 2,
  });
  assert.equal(JSON.stringify(log).includes('selfie.webp'), false);
});

it('an optional empty rejected answer still blocks application approval', async () => {
  const f = fixture();
  f.app.status = 'CHANGES_REQUESTED';
  f.app.fields = [
    {
      id: 'answer',
      requirement_id: 'optional',
      status: 'REJECTED',
      value: null,
      definition: {
        id: 'optional',
        label: 'Additional details',
        field_type: 'TEXT',
        is_required: false,
      },
    },
  ];
  await assert.rejects(
    f.service.approve_application('fixture-admin', f.app.id, {
      version: 1,
      decision: 'APPROVED',
    }),
    errorCode('PARTNER_VALIDATION_ERROR'),
  );
  assert.equal(f.app.status, 'CHANGES_REQUESTED');
});

it('submissions recheck file size and changed extension rules before accepting existing uploads', async () => {
  for (const scenario of ['oversized', 'extension'] as const) {
    const f = fixture();
    f.app.status = 'SUBMITTED';
    f.app.fields = [
      {
        id: 'answer',
        requirement_id: 'document',
        status: 'PENDING',
        value: ['asset'],
        definition: {
          id: 'document',
          label: 'Proof',
          field_type: 'FILE',
          is_required: true,
          max_file_size_mb: 1,
          allowed_extensions: ['.pdf'],
        },
      },
    ];
    f.setAssets([
      {
        id: 'asset',
        owner_id: f.app.user_id,
        field_id: 'document',
        purpose: 'APPLICATION_DOCUMENT',
        file_name: scenario === 'extension' ? 'old.docx' : 'proof.pdf',
        mime_type:
          scenario === 'extension'
            ? 'application/octet-stream'
            : 'application/pdf',
        size: scenario === 'oversized' ? 2_000_000 : 1000,
      },
    ]);
    await assert.rejects(
      f.service.submit(f.app.user_id, {
        version: 1,
        policy_version: 1,
        accepted: true,
        contact_email: 'fixture@example.test',
        whatsapp_phone: '+919876543210',
        answers: [{ requirement_id: 'document', value: ['asset'] }],
      }),
      errorCode('PARTNER_VALIDATION_ERROR'),
    );
    assert.equal(f.state.committed, 0);
  }
});

it('private final PDFs remain unavailable before final approval', async () => {
  const f = fixture();
  f.app.status = 'CONFIRMATION_SUBMITTED';
  f.app.final_pdf_id = 'asset';
  f.setAssets([
    {
      id: 'asset',
      owner_id: f.app.user_id,
      field_id: '',
      purpose: 'FINAL_PDF',
      file_name: 'final.pdf',
      mime_type: 'application/pdf',
      size: 1000,
    },
  ]);
  await assert.rejects(
    f.service.asset(f.app.user_id, 'asset'),
    errorCode('FILE_NOT_FOUND'),
  );
  f.app.status = 'COMPLETED';
  assert.equal((await f.service.asset(f.app.user_id, 'asset')).id, 'asset');
  await assert.rejects(
    f.service.asset('another-rider', 'asset'),
    errorCode('FILE_NOT_FOUND'),
  );
});

it('document sanitization retains formatting and safe images while removing executable content', () => {
  const html = clean_document(
    '<h2 style="text-align:center">Policy</h2><script>alert(1)</script><a href="javascript:alert(1)" onclick="alert(1)">Link</a><img src="https://res.cloudinary.com/example/image/upload/a.webp" onerror="alert(1)"><img src="https://untrusted.example/tracker"><p style="background-image:url(javascript:alert(1));color:#b45309">Text</p>',
  );
  assert.match(html, /text-align:center/);
  assert.match(html, /color:#b45309/);
  assert.match(html, /res.cloudinary.com/);
  assert.doesNotMatch(
    html,
    /script|onclick|onerror|javascript|untrusted|background-image/,
  );
});

it('a large final submission validates upload metadata once and atomically queues admin/applicant emails', async () => {
  const f = fixture();
  f.app.status = 'SUBMITTED';
  f.app.fields = Array.from({ length: 31 }, (_, i) => {
    const id = i === 30 ? '__live_selfie__' : 'document-' + i;
    return {
      id: 'answer-' + i,
      requirement_id: id,
      status: 'PENDING',
      value: ['asset-' + i],
      definition: {
        id,
        label: id,
        field_type: i === 30 ? 'IMAGE' : 'FILE',
        is_required: true,
      },
    };
  });
  f.setAssets(
    f.app.fields.map((field, i) => ({
      id: 'asset-' + i,
      owner_id: f.app.user_id,
      field_id: field.requirement_id,
      purpose: i === 30 ? 'APPLICATION_SELFIE' : 'APPLICATION_DOCUMENT',
      mime_type: i === 30 ? 'image/webp' : 'application/pdf',
      file_name: i === 30 ? 'selfie.webp' : 'proof.pdf',
      size: 1000,
    })),
  );
  const result = await f.service.submit(f.app.user_id, {
    version: 1,
    policy_version: 1,
    accepted: true,
    contact_email: 'rider@example.test',
    whatsapp_phone: '+919999999999',
    answers: f.app.fields.map((field) => ({
      requirement_id: field.requirement_id,
      value: field.value as string[],
    })),
  });
  assert.equal(result.status, 'SUBMITTED');
  assert.equal(f.state.assetReads, 1);
  assert.equal(f.state.committed, 1);
  assert.equal(f.queuedEmails.length, 2);
  assert.deepEqual(
    f.queuedEmails.map(
      (row) => (row.data as Record<string, unknown>).recipient_role,
    ),
    ['ADMIN', 'APPLICANT'],
  );
  assert.ok(!JSON.stringify(f.queuedEmails).includes('data_url'));
});
