import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app/app';
import { prisma as db } from '../../src/database/db';

/**
 * Multi-tenancy + API-key auth coverage:
 *  - org A cannot read/write org B resources
 *  - API keys authenticate via X-API-Key, enforce scopes + project boundary
 *  - revoked keys are rejected
 */
describe('Security: org isolation + API keys', () => {
  const suffix = Date.now().toString(36);
  const emailA = `sec-a-${suffix}@example.com`;
  const emailB = `sec-b-${suffix}@example.com`;
  let tokenA = '';
  let tokenB = '';
  let orgA = '';
  let orgB = '';
  let projectA = '';
  let projectB = '';
  let queueA = '';
  let queueB = '';
  let jobB = '';
  let apiKeyRaw = '';
  let apiKeyId = '';
  let readOnlyKeyRaw = '';

  const registerLogin = async (email: string) => {
    await request(app).post('/api/v1/auth/register').send({
      email,
      password: 'StrongPassword1!',
      name: 'Sec Test',
    });
    await db.user.update({ where: { email }, data: { isVerified: true } });
    const res = await request(app).post('/api/v1/auth/login').send({
      email,
      password: 'StrongPassword1!',
    });
    return res.body.data.accessToken as string;
  };

  beforeAll(async () => {
    tokenA = await registerLogin(emailA);
    tokenB = await registerLogin(emailB);

    const oa = await request(app).post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Org A', slug: `org-a-${suffix}` });
    expect(oa.status).toBe(201);
    orgA = oa.body.id ?? oa.body.data?.id;

    const ob = await request(app).post('/api/v1/organizations')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Org B', slug: `org-b-${suffix}` });
    expect(ob.status).toBe(201);
    orgB = ob.body.id ?? ob.body.data?.id;

    const pa = await request(app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ organizationId: orgA, name: 'Proj A' });
    expect(pa.status).toBe(201);
    projectA = pa.body.id ?? pa.body.data?.id;

    const pb = await request(app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ organizationId: orgB, name: 'Proj B' });
    expect(pb.status).toBe(201);
    projectB = pb.body.id ?? pb.body.data?.id;

    const qa = await request(app).post('/api/v1/queues')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ projectId: projectA, name: 'queue-a' });
    expect(qa.status).toBe(201);
    queueA = qa.body.id ?? qa.body.data?.id;

    const qb = await request(app).post('/api/v1/queues')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ projectId: projectB, name: 'queue-b' });
    expect(qb.status).toBe(201);
    queueB = qb.body.id ?? qb.body.data?.id;

    const jb = await request(app).post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ queueId: queueB, type: 'IMMEDIATE', payload: {} });
    expect(jb.status).toBe(201);
    jobB = jb.body.id ?? jb.body.data?.id;
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: [emailA, emailB] } } });
    const orgIds = [orgA, orgB].filter(Boolean);
    if (orgIds.length) await db.organization.deleteMany({ where: { id: { in: orgIds } } });
  });

  it('org A user cannot read org B job', async () => {
    const res = await request(app).get(`/api/v1/jobs/${jobB}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect([403, 404]).toContain(res.status);
  });

  it('org A user cannot create job in org B queue', async () => {
    const res = await request(app).post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ queueId: queueB, type: 'IMMEDIATE', payload: {} });
    expect(res.status).toBe(403);
  });

  it('org A user cannot create project inside org B', async () => {
    const res = await request(app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ organizationId: orgB, name: 'evil' });
    expect(res.status).toBe(403);
  });

  it('queue list for foreign project returns nothing', async () => {
    const res = await request(app).get(`/api/v1/queues?projectId=${projectB}`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    const rows = Array.isArray(res.body) ? res.body : res.body.data ?? [];
    expect(rows.length).toBe(0);
  });

  it('cannot DAG-link a job to a foreign-org parent', async () => {
    const res = await request(app).post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ queueId: queueA, type: 'IMMEDIATE', payload: {}, dependsOn: [jobB] });
    expect(res.status).toBe(403);
  });

  it('creates an API key; raw token returned once, hash never listed', async () => {
    const res = await request(app).post(`/api/v1/projects/${projectA}/api-keys`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'svc-key', scopes: ['JOB_READ', 'JOB_WRITE', 'JOB_RETRY'] });
    expect(res.status).toBe(201);
    apiKeyRaw = res.body.token;
    apiKeyId = res.body.apiKey.id;
    expect(apiKeyRaw).toMatch(/^djs_proj_/);

    const list = await request(app).get(`/api/v1/projects/${projectA}/api-keys`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(list.status).toBe(200);
    const rows = Array.isArray(list.body) ? list.body : list.body.data ?? [];
    expect(rows.length).toBe(1);
    expect(rows[0].keyHash).toBeUndefined();
    expect(rows[0].token).toBeUndefined();
  });

  it('API key authenticates and writes within its project', async () => {
    const res = await request(app).post('/api/v1/jobs')
      .set('X-API-Key', apiKeyRaw)
      .send({ queueId: queueA, type: 'IMMEDIATE', payload: {} });
    expect(res.status).toBe(201);
  });

  it('API key cannot touch another project', async () => {
    const res = await request(app).get(`/api/v1/jobs/${jobB}`)
      .set('X-API-Key', apiKeyRaw);
    expect(res.status).toBe(403);
  });

  it('API key cannot manage API keys', async () => {
    const res = await request(app).post(`/api/v1/projects/${projectA}/api-keys`)
      .set('X-API-Key', apiKeyRaw)
      .send({ name: 'self-replicate', scopes: ['JOB_READ'] });
    expect(res.status).toBe(403);
  });

  it('read-only key is scope-denied on write', async () => {
    const res = await request(app).post(`/api/v1/projects/${projectA}/api-keys`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'ro-key', scopes: ['JOB_READ'] });
    expect(res.status).toBe(201);
    readOnlyKeyRaw = res.body.token;

    const write = await request(app).post('/api/v1/jobs')
      .set('X-API-Key', readOnlyKeyRaw)
      .send({ queueId: queueA, type: 'IMMEDIATE', payload: {} });
    expect(write.status).toBe(403);

    const read = await request(app).get(`/api/v1/jobs?queueId=${queueA}`)
      .set('X-API-Key', readOnlyKeyRaw);
    expect(read.status).toBe(200);
  });

  it('revoked key is rejected', async () => {
    const revoke = await request(app).post(`/api/v1/api-keys/${apiKeyId}/revoke`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ reason: 'test' });
    expect(revoke.status).toBe(200);

    const res = await request(app).get(`/api/v1/jobs?queueId=${queueA}`)
      .set('X-API-Key', apiKeyRaw);
    expect(res.status).toBe(401);
  });

  it('org B user cannot revoke org A api key', async () => {
    const res = await request(app).post(`/api/v1/api-keys/${apiKeyId}/revoke`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ reason: 'hostile' });
    expect([403, 404]).toContain(res.status);
  });

  it('API key org list returns only its own organization', async () => {
    const key = await request(app).post(`/api/v1/projects/${projectA}/api-keys`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'org-reader', scopes: ['ORGANIZATION_READ'] });
    expect(key.status).toBe(201);

    const res = await request(app).get('/api/v1/organizations')
      .set('X-API-Key', key.body.token);
    expect(res.status).toBe(200);
    const rows = Array.isArray(res.body) ? res.body : res.body.data ?? [];
    // Must never leak org B (or any other tenant) to a project-scoped key
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(orgA);
  });

  it('API key without QUEUE_WRITE cannot manage retry policies', async () => {
    // readOnlyKeyRaw holds only JOB_READ
    const res = await request(app).post('/api/v1/retry-policies')
      .set('X-API-Key', readOnlyKeyRaw)
      .send({ name: 'rogue-policy', organizationId: orgA, maxAttempts: 3 });
    expect(res.status).toBe(403);
  });

  it('idempotent resubmission on the same queue returns the original job', async () => {
    const key = `idem-same-${suffix}`;
    const first = await request(app).post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ queueId: queueA, type: 'IMMEDIATE', payload: {}, idempotencyKey: key });
    expect(first.status).toBe(201);

    const again = await request(app).post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ queueId: queueA, type: 'IMMEDIATE', payload: {}, idempotencyKey: key });
    expect(again.status).toBe(200);
    expect(again.body.deduplicated).toBe(true);
    expect(again.body.id).toBe(first.body.id ?? first.body.data?.id);
  });

  it('idempotencyKey collision on a foreign tenant returns 409, not their job', async () => {
    const key = `idem-foreign-${suffix}`;
    const owned = await request(app).post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ queueId: queueB, type: 'IMMEDIATE', payload: { secret: 'org-b-data' }, idempotencyKey: key });
    expect(owned.status).toBe(201);

    const res = await request(app).post('/api/v1/jobs')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ queueId: queueA, type: 'IMMEDIATE', payload: {}, idempotencyKey: key });
    expect(res.status).toBe(409);
    expect(JSON.stringify(res.body)).not.toContain('org-b-data');
    expect(res.body.id).toBeUndefined();
  });

  it('cannot attach a foreign-org retry policy to a queue', async () => {
    const policy = await request(app).post('/api/v1/retry-policies')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'org-b-policy', organizationId: orgB, maxAttempts: 3 });
    expect(policy.status).toBe(201);
    const foreignPolicyId = policy.body.id ?? policy.body.data?.id;

    const create = await request(app).post('/api/v1/queues')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ projectId: projectA, name: `xattach-${suffix}`, retryPolicyId: foreignPolicyId });
    expect(create.status).toBe(403);

    const attach = await request(app).patch(`/api/v1/queues/${queueA}/retry-policy`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ retryPolicyId: foreignPolicyId });
    expect(attach.status).toBe(403);
  });
});
