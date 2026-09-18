import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { issueSessionToken } from '../src/lib/tokens.js';

const app = createApp();

describe('api', () => {
  it('serves the discovery document', async () => {
    const response = await request(app).get('/api');

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('skatis-api');
  });

  it('reports liveness without touching the database', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it('echoes a provided request id', async () => {
    const response = await request(app).get('/api/health').set('X-Request-Id', 'test-request-id');

    expect(response.headers['x-request-id']).toBe('test-request-id');
  });

  it('answers unknown routes with the error envelope', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.requestId).toBeTypeOf('string');
    expect(response.body.error.message).toContain('does not exist');
  });

  it('answers malformed json with 400', async () => {
    const response = await request(app)
      .post('/api/tournaments')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('validates the payload before touching the database', async () => {
    const response = await request(app).post('/api/tournaments').send({ name: 'x' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('validates path parameters before touching the database', async () => {
    const response = await request(app)
      .get('/api/tournaments/Mittwochsrunde/lists/nonsense')
      .set('Authorization', `Bearer ${issueSessionToken('Mittwochsrunde', 'MEMBER').token}`);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues[0].path).toBe('matchday');
  });

  it('requires a bearer token for protected endpoints', async () => {
    const response = await request(app).get('/api/tournaments/Mittwochsrunde/lists');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a token issued for another tournament', async () => {
    const { token } = issueSessionToken('OtherTournament', 'ADMIN');
    const response = await request(app)
      .get('/api/tournaments/Mittwochsrunde/lists')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects a member token on admin only endpoints', async () => {
    const { token } = issueSessionToken('Mittwochsrunde', 'MEMBER');
    const response = await request(app)
      .delete('/api/tournaments/Mittwochsrunde')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('handles cors preflight requests', async () => {
    const response = await request(app)
      .options('/api/tournaments')
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });
});
