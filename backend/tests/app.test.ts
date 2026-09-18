import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { issueSessionToken } from '../src/lib/tokens.js';

const app = createApp();

const TOURNAMENT_ID = 'K7M2P4QX';
const OTHER_TOURNAMENT_ID = 'Z9YXWVTS';

describe('api', () => {
  it('serves the discovery document', async () => {
    const response = await request(app).get('/api');

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe('skatis-api');
    expect(response.body.data.endpoints.createTournament).toBe('POST /api/createTournament');
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
      .post('/api/createTournament')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('BAD_REQUEST');
  });

  it('validates the create payload before touching the database', async () => {
    const response = await request(app).post('/api/createTournament').send({ name: 'x' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues.length).toBeGreaterThan(0);
  });

  it('validates the login payload before touching the database', async () => {
    const response = await request(app)
      .post('/api/loginTournament')
      .send({ tournamentId: '', password: '' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('validates path parameters before touching the database', async () => {
    const response = await request(app)
      .get(`/api/tournaments/${TOURNAMENT_ID}/lists/nonsense`)
      .set('Authorization', `Bearer ${issueSessionToken(TOURNAMENT_ID, 'MEMBER').token}`);

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues[0].path).toBe('matchday');
  });

  it('requires a bearer token for protected endpoints', async () => {
    const response = await request(app).get(`/api/tournaments/${TOURNAMENT_ID}/lists`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('protects the tournament details', async () => {
    const response = await request(app).get(`/api/tournaments/${TOURNAMENT_ID}`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('protects the tournament overview', async () => {
    const response = await request(app).get('/api/tournaments');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects details of another tournament', async () => {
    const { token } = issueSessionToken(OTHER_TOURNAMENT_ID, 'MEMBER');
    const response = await request(app)
      .get(`/api/tournaments/${TOURNAMENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects a token issued for another tournament', async () => {
    const { token } = issueSessionToken(OTHER_TOURNAMENT_ID, 'ADMIN');
    const response = await request(app)
      .get(`/api/tournaments/${TOURNAMENT_ID}/lists`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('accepts a lower case tournament id in the path', async () => {
    const { token } = issueSessionToken(TOURNAMENT_ID, 'MEMBER');
    const response = await request(app)
      .get(`/api/tournaments/${TOURNAMENT_ID.toLowerCase()}/lists`)
      .set('Authorization', `Bearer ${token}`);

    // Passed the authorisation check and reached the database lookup.
    expect(response.status).not.toBe(403);
    expect([404, 503]).toContain(response.status);
  });

  it('rejects a member token on admin only endpoints', async () => {
    const { token } = issueSessionToken(TOURNAMENT_ID, 'MEMBER');
    const response = await request(app)
      .delete(`/api/tournaments/${TOURNAMENT_ID}`)
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('requires a bearer token for the players of a tournament', async () => {
    const response = await request(app).get(`/api/tournaments/${TOURNAMENT_ID}/players`);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('validates a new player before touching the database', async () => {
    const { token } = issueSessionToken(TOURNAMENT_ID, 'MEMBER');
    const response = await request(app)
      .post(`/api/tournaments/${TOURNAMENT_ID}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues[0].path).toBe('name');
  });

  it('validates the lineup of a list before touching the database', async () => {
    const { token } = issueSessionToken(TOURNAMENT_ID, 'MEMBER');
    const response = await request(app)
      .put(`/api/tournaments/${TOURNAMENT_ID}/lists/2026-09-16/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({ playerIds: [] });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues[0].path).toBe('playerIds');
  });

  it('validates the properties of a game before touching the database', async () => {
    const { token } = issueSessionToken(TOURNAMENT_ID, 'MEMBER');
    const response = await request(app)
      .post(`/api/tournaments/${TOURNAMENT_ID}/lists/2026-09-16/games`)
      .set('Authorization', `Bearer ${token}`)
      .send({ passedOut: false, declarer: 'Anna', gameType: 'GRAND', won: true });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.issues[0].path).toBe('matadors');
  });

  it('accepts a passed out game and then looks for the list', async () => {
    const { token } = issueSessionToken(TOURNAMENT_ID, 'MEMBER');
    const response = await request(app)
      .post(`/api/tournaments/${TOURNAMENT_ID}/lists/2026-09-16/games`)
      .set('Authorization', `Bearer ${token}`)
      .send({ passedOut: true });

    // Valid input passed the schema, so the request reached the database.
    expect(response.status).not.toBe(422);
    expect([404, 503]).toContain(response.status);
  });

  it('rejects players of another tournament', async () => {
    const { token } = issueSessionToken(OTHER_TOURNAMENT_ID, 'ADMIN');
    const response = await request(app)
      .post(`/api/tournaments/${TOURNAMENT_ID}/players`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Anna' });

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
