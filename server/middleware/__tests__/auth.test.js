import { jest } from '@jest/globals';

// Mock the database before importing auth
jest.unstable_mockModule('../../db/index.js', () => ({
  query: jest.fn()
}));

const { query } = await import('../../db/index.js');
const { authenticate, requireAdmin, generateToken } = await import('../auth.js');

describe('Auth Middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    mockNext = jest.fn();
    jest.clearAllMocks();
  });

  describe('authenticate', () => {
    test('returns 401 when no token provided', async () => {
      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('returns 401 when token format is invalid', async () => {
      mockReq.headers.authorization = 'InvalidFormat token';

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No token provided' });
    });

    test('returns 401 when token is invalid', async () => {
      mockReq.headers.authorization = 'Bearer invalid-token';

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    });

    test('returns 401 when user not found', async () => {
      const token = generateToken(999);
      mockReq.headers.authorization = `Bearer ${token}`;
      query.mockResolvedValue({ rows: [] });

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    test('sets user on request and calls next on success', async () => {
      const user = { id: 1, email: 'test@example.com', role: 'user' };
      const token = generateToken(user.id);
      mockReq.headers.authorization = `Bearer ${token}`;
      query.mockResolvedValue({ rows: [user] });

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockReq.user).toEqual(user);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    test('returns 403 when user is not admin', () => {
      mockReq.user = { id: 1, role: 'user' };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Admin access required' });
    });

    test('calls next when user is admin', () => {
      mockReq.user = { id: 1, role: 'admin' };

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('generateToken', () => {
    test('generates a valid JWT token', () => {
      const token = generateToken(123);

      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });
  });
});
