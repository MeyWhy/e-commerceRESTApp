process.env.JWT_SECRET = 'test-secret';
// Deliberately not setting LOGSTASH_HOST so logger.js stays on stdout-only.

const db = require('../db.js');
jest.mock('../db.js', () => require('./mockDb.js'));

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../app.js');

const adminToken = jwt.sign({ userId: 1, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const customerToken = (userId) => jwt.sign({ userId, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '1h' });

beforeEach(() => {
  db.query.mockReset();
});

describe('POST /api/auth/register', () => {
  it('rejects a request missing required fields', async () => {
    const res = await request(app).post('/api/auth/register').send({ username: 'ab' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'newuser', password: 'short', name: 'New User', email: 'new@example.com', address: '123 Main St'
    });
    expect(res.status).toBe(400);
    expect(res.body.details.some(d => d.field === 'password')).toBe(true);
  });

  it('rejects an invalid email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      username: 'newuser', password: 'longenough', name: 'New User', email: 'not-an-email', address: '123 Main St'
    });
    expect(res.status).toBe(400);
    expect(res.body.details.some(d => d.field === 'email')).toBe(true);
  });

  it('registers a valid user and returns 201', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 42 }]);

    const res = await request(app).post('/api/auth/register').send({
      username: 'newuser', password: 'longenough', name: 'New User', email: 'new@example.com', address: '123 Main St'
    });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({ id: 42, username: 'newuser', address: '123 Main St' });
    // password must never appear in the response
    expect(JSON.stringify(res.body)).not.toMatch(/longenough/);
  });

  it('returns 400 on duplicate username', async () => {
    const dupError = new Error('Duplicate entry');
    dupError.code = 'ER_DUP_ENTRY';
    db.query.mockRejectedValueOnce(dupError);

    const res = await request(app).post('/api/auth/register').send({
      username: 'existinguser', password: 'longenough', name: 'Someone', email: 'a@example.com', address: 'Addr'
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Username already exists');
  });
});

describe('POST /api/auth/login', () => {
  it('rejects missing credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  it('returns 401 for an unknown username', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('returns 401 for a wrong password', async () => {
    const hashed = await bcrypt.hash('correctpassword', 4);
    db.query.mockResolvedValueOnce([[{ id: 1, username: 'bob', password: hashed, role: 'customer' }]]);

    const res = await request(app).post('/api/auth/login').send({ username: 'bob', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns a JWT on valid credentials', async () => {
    const hashed = await bcrypt.hash('correctpassword', 4);
    db.query.mockResolvedValueOnce([[{
      id: 1, username: 'bob', password: hashed, name: 'Bob', email: 'bob@example.com', address: 'Addr', role: 'customer'
    }]]);

    const res = await request(app).post('/api/auth/login').send({ username: 'bob', password: 'correctpassword' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.username).toBe('bob');
    // password hash must never leave the server
    expect(res.body.user.password).toBeUndefined();

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.userId).toBe(1);
    expect(decoded.role).toBe('customer');
  });
});

describe('authorization on protected routes', () => {
  it('GET /api/auth/ requires a token', async () => {
    const res = await request(app).get('/api/auth/');
    expect(res.status).toBe(401);
  });

  it('GET /api/auth/ rejects a non-admin token', async () => {
    const res = await request(app).get('/api/auth/').set('Authorization', `Bearer ${customerToken(2)}`);
    expect(res.status).toBe(403);
  });

  it('GET /api/auth/ allows admin and never leaks password hashes', async () => {
    db.query.mockResolvedValueOnce([[
      { id: 2, name: 'Bob', username: 'bob', email: 'bob@example.com', address: 'Addr', role: 'customer' }
    ]]);
    const res = await request(app).get('/api/auth/').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    // regression guard: the query itself must not select every column
    const [sql] = db.query.mock.calls[0];
    expect(sql.toLowerCase()).not.toContain('select *');
  });

  it('DELETE /api/auth/user/:id requires admin (regression test for the unauthenticated-delete bug)', async () => {
    const res = await request(app)
      .delete('/api/auth/user/5')
      .set('Authorization', `Bearer ${customerToken(5)}`);
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('DELETE /api/auth/user/:id with no token at all is rejected', async () => {
    const res = await request(app).delete('/api/auth/user/5');
    expect(res.status).toBe(401);
  });

  it('DELETE /api/auth/user/:id succeeds for an admin', async () => {
    db.query
      .mockResolvedValueOnce([[{ id: 5, username: 'target' }]]) // existence check
      .mockResolvedValueOnce([{}]); // delete

    const res = await request(app)
      .delete('/api/auth/user/5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  it('a customer can fetch their own profile but not someone else\'s', async () => {
    db.query.mockResolvedValueOnce([[{ id: 7, name: 'Me', username: 'me', email: 'me@example.com', address: 'Addr', role: 'customer' }]]);
    const ownRes = await request(app).get('/api/auth/7').set('Authorization', `Bearer ${customerToken(7)}`);
    expect(ownRes.status).toBe(200);

    const otherRes = await request(app).get('/api/auth/999').set('Authorization', `Bearer ${customerToken(7)}`);
    expect(otherRes.status).toBe(403);
  });
});
