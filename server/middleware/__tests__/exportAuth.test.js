import { jest } from '@jest/globals';

// Mock the database before importing auth (same approach as auth.test.js)
jest.unstable_mockModule('../../db/index.js', () => ({
  query: jest.fn()
}));

const { query } = await import('../../db/index.js');
const { generateToken, authenticate } = await import('../auth.js');
const { matchesExportToken, authenticateExportRead } = await import('../exportAuth.js');

const TOKEN = 'export-token-for-tests-0123456789abcdef';

describe('Export token auth', () => {
  const originalToken = process.env.EXPORT_API_TOKEN;
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    process.env.EXPORT_API_TOKEN = TOKEN;
    mockReq = { headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.EXPORT_API_TOKEN;
    else process.env.EXPORT_API_TOKEN = originalToken;
  });

  describe('matchesExportToken', () => {
    test('accepts the configured token', () => {
      expect(matchesExportToken(`Bearer ${TOKEN}`)).toBe(true);
    });

    test('rejects a wrong token of the same length', () => {
      const wrong = 'X' + TOKEN.slice(1);
      expect(wrong).toHaveLength(TOKEN.length);
      expect(matchesExportToken(`Bearer ${wrong}`)).toBe(false);
    });

    test('rejects shorter, longer and prefix/suffix variants without throwing', () => {
      expect(matchesExportToken(`Bearer ${TOKEN.slice(0, -1)}`)).toBe(false);
      expect(matchesExportToken(`Bearer ${TOKEN}x`)).toBe(false);
      expect(matchesExportToken(`Bearer ${TOKEN} `)).toBe(false);
      expect(matchesExportToken('Bearer ')).toBe(false);
    });

    test('rejects missing header and non-Bearer schemes', () => {
      expect(matchesExportToken(undefined)).toBe(false);
      expect(matchesExportToken('')).toBe(false);
      expect(matchesExportToken(TOKEN)).toBe(false);
      expect(matchesExportToken(`Basic ${TOKEN}`)).toBe(false);
      expect(matchesExportToken(`bearer ${TOKEN}`)).toBe(false);
    });

    test.each([undefined, ''])('feature is off when EXPORT_API_TOKEN is %p', (value) => {
      if (value === undefined) delete process.env.EXPORT_API_TOKEN;
      else process.env.EXPORT_API_TOKEN = value;

      expect(matchesExportToken('Bearer ')).toBe(false);
      expect(matchesExportToken('Bearer undefined')).toBe(false);
      expect(matchesExportToken(`Bearer ${TOKEN}`)).toBe(false);
    });
  });

  describe('authenticateExportRead', () => {
    test('valid export token is allowed without touching the database', async () => {
      mockReq.headers.authorization = `Bearer ${TOKEN}`;

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      // The token must not masquerade as a user
      expect(mockReq.user).toBeUndefined();
    });

    test('valid export token marks the request with exportTokenAuth = true', async () => {
      mockReq.headers.authorization = `Bearer ${TOKEN}`;

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockReq.exportTokenAuth).toBe(true);
    });

    test('admin JWT path does not set the mark (exportTokenAuth stays false)', async () => {
      const admin = { id: 2, email: 'admin@example.com', role: 'admin' };
      mockReq.headers.authorization = `Bearer ${generateToken(admin.id)}`;
      query.mockResolvedValue({ rows: [admin] });

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.exportTokenAuth).toBe(false);
    });

    test('the mark cannot be set by the client via headers, query or body', async () => {
      const admin = { id: 2, email: 'admin@example.com', role: 'admin' };
      mockReq.headers.authorization = `Bearer ${generateToken(admin.id)}`;
      mockReq.headers['x-export-token-auth'] = 'true';
      mockReq.headers.exporttokenauth = 'true';
      mockReq.query = { exportTokenAuth: 'true', 'req.exportTokenAuth': 'true' };
      mockReq.body = { exportTokenAuth: true };
      query.mockResolvedValue({ rows: [admin] });

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.exportTokenAuth).toBe(false);
    });

    test('a stale/pre-set mark is reset on the JWT path', async () => {
      const admin = { id: 2, email: 'admin@example.com', role: 'admin' };
      mockReq.exportTokenAuth = true;
      mockReq.headers.authorization = `Bearer ${generateToken(admin.id)}`;
      query.mockResolvedValue({ rows: [admin] });

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockReq.exportTokenAuth).toBe(false);
    });

    test('denied requests (wrong token) are never marked as token-authenticated', async () => {
      mockReq.headers.authorization = 'Bearer not-the-export-token';

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockReq.exportTokenAuth).not.toBe(true);
    });

    test('no Authorization header -> 401 No token provided (unchanged)', async () => {
      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('wrong token -> 401 Invalid or expired token (same as before)', async () => {
      mockReq.headers.authorization = 'Bearer not-the-export-token';

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('feature off: the would-be token is just an invalid JWT (401)', async () => {
      delete process.env.EXPORT_API_TOKEN;
      mockReq.headers.authorization = `Bearer ${TOKEN}`;

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('feature off: empty token does not let "Bearer " through', async () => {
      process.env.EXPORT_API_TOKEN = '';
      mockReq.headers.authorization = 'Bearer ';

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    test('admin JWT still works exactly as before', async () => {
      const admin = { id: 2, email: 'admin@example.com', role: 'admin' };
      mockReq.headers.authorization = `Bearer ${generateToken(admin.id)}`;
      query.mockResolvedValue({ rows: [admin] });

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockReq.user).toEqual(admin);
    });

    test('admin JWT works when EXPORT_API_TOKEN is unset', async () => {
      delete process.env.EXPORT_API_TOKEN;
      const admin = { id: 2, email: 'admin@example.com', role: 'admin' };
      mockReq.headers.authorization = `Bearer ${generateToken(admin.id)}`;
      query.mockResolvedValue({ rows: [admin] });

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('non-admin JWT -> 403 Admin access required (unchanged)', async () => {
      const user = { id: 1, email: 'user@example.com', role: 'user' };
      mockReq.headers.authorization = `Bearer ${generateToken(user.id)}`;
      query.mockResolvedValue({ rows: [user] });

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Admin access required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('JWT for an unknown user -> 401 User not found (unchanged)', async () => {
      mockReq.headers.authorization = `Bearer ${generateToken(999)}`;
      query.mockResolvedValue({ rows: [] });

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('unexpected database errors are still passed to next(err)', async () => {
      const boom = new Error('db down');
      mockReq.headers.authorization = `Bearer ${generateToken(2)}`;
      query.mockRejectedValue(boom);

      await authenticateExportRead(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(boom);
    });
  });

  describe('token grants nothing outside the export routes', () => {
    test('the regular authenticate middleware rejects the export token', async () => {
      mockReq.headers.authorization = `Bearer ${TOKEN}`;

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockReq.user).toBeUndefined();
    });
  });
});
