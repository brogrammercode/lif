import assert from 'node:assert/strict';
import { it } from 'node:test';
import { PrismaService } from '../infra/database/prisma.service.js';
import { PartnerProgramService } from '../features/partner_program/partner_program.service.js';
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
    onPartnerLock: () => {},
  };
  const app = {
    id: 'fixture-application',
    user_id: 'fixture-rider',
    contact_email: 'rider@example.test',
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
    purpose: string;
    field_id: string;
    file_name: string;
    mime_type: string;
    size: number;
  }[] = [];
  const tx = {
    $executeRaw: async (strings: TemplateStringsArray) => {
      if (strings.join('').includes('720061')) state.onPartnerLock();
      return 1;
    },
    user: {
      findMany: async () => [
        { id: 'fixture-admin', email: 'admin@example.test' },
      ],
      findUnique: async ({ where }: { where: { id: string } }) => ({
        role: where.id === 'fixture-admin' ? 'ADMIN' : state.role,
        status: 'ACTIVE',
        deleted_at: null,
      }),
      updateMany: async ({ where }: { where: { role: string } }) => {
        if (state.losePromotion) state.role = 'ADMIN';
        if (state.role !== where.role) return { count: 0 };
        state.role = 'DRIVER';
        return { count: 1 };
      },
      update: async () => ({ role: state.role }),
    },
    session: { create: async () => ({ id: 'fixture-session' }) },
    partnerApplication: {
      findUnique: async () => ({ ...app }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        const version = data.version as { increment?: number } | undefined;
        if (version?.increment)
          data = { ...data, version: app.version + version.increment };
        const attempts = data.activation_attempts as
          { increment?: number } | undefined;
        if (attempts?.increment)
          data = {
            ...data,
            activation_attempts: app.activation_attempts + attempts.increment,
          };
        Object.assign(app, data);
        return app;
      },
    },
    partnerDocument: {
      findUnique: async () =>
        state.publishedConfirmation
          ? {
              title: 'Confirmation',
              published_title: 'Confirmation',
              published_html: '<p>Accepted terms</p>',
              published_version: 1,
              published_at: new Date(),
            }
          : null,
    },
    partnerConfirmation: { upsert: async () => ({}) },
    notification: {
      create: async () => ({}),
      createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
        queuedEmails.push(...data);
        return { count: data.length };
      },
    },
    partnerAsset: {
      findMany: async ({
        where,
      }: {
        where: {
          owner_id: string;
          purpose?: string;
          field_id?: string;
          id?: { in: string[] };
        };
      }) => {
        state.assetReads++;
        return assetRows.filter(
          (asset) =>
            asset.owner_id === where.owner_id &&
            (!where.purpose || asset.purpose === where.purpose) &&
            (!where.field_id || asset.field_id === where.field_id) &&
            (!where.id || where.id.in.includes(asset.id)),
        );
      },
      findUnique: async () => assetRows[0] ?? null,
    },
    driverProfile: {
      upsert: async () => {
        state.driverWrites++;
        return {};
      },
    },
    userLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        audits.push(data);
        return {};
      },
    },
  };
  const database = new PrismaService();
  Object.defineProperty(database, 'client', {
    value: {
      ...tx,
      $transaction: async (action: (client: typeof tx) => Promise<unknown>) => {
        const result = await action(tx);
        state.committed++;
        return result;
      },
    },
  });
  return {
    service: new PartnerProgramService(database),
    database,
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
      $executeRaw: async () => 1,
      user: {
        findUnique: async () => ({
          role: 'ADMIN',
          status: 'ACTIVE',
          deleted_at: null,
        }),
      },
      requirementCategory: {
        findUnique: async () => ({
          id: 'category',
          is_active: operation === 'create-field',
          updated_at: changedAt,
        }),
      },
      partnerRequirement: {
        findUnique: async () => null,
        count: async () => (operation === 'create-field' ? 200 : 201),
      },
    };
    const database = new PrismaService();
    Object.defineProperty(database, 'client', {
      value: {
        $transaction: async (
          callback: (transaction: typeof tx) => Promise<unknown>,
        ) => callback(tx),
      },
    });
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
  const auth = new AuthRepository(f.database);
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
