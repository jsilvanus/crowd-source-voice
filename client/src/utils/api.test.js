import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import api from './api';

describe('API Client', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('request', () => {
    test('adds authorization header when token exists', async () => {
      localStorage.setItem('token', 'test-token');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await api.get('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token'
          })
        })
      );
    });

    test('does not add authorization header when no token', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await api.get('/test');

      const callArgs = global.fetch.mock.calls[0][1];
      expect(callArgs.headers.Authorization).toBeUndefined();
    });

    test('throws error on non-ok response', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ error: 'Unauthorized' })
      });

      await expect(api.get('/test')).rejects.toThrow('Unauthorized');
    });
  });

  describe('get', () => {
    test('makes GET request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await api.get('/test');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('post', () => {
    test('makes POST request with JSON body', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ data: 'test' })
      });

      await api.post('/test', { foo: 'bar' });

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ foo: 'bar' }),
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('delete', () => {
    test('makes DELETE request', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ message: 'deleted' })
      });

      await api.delete('/test/1');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/test/1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });

  describe('upload', () => {
    test('makes POST request with FormData', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: () => Promise.resolve({ id: 1 })
      });

      const formData = new FormData();
      formData.append('file', new Blob(['test']));

      await api.upload('/upload', formData);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/upload',
        expect.objectContaining({
          method: 'POST',
          body: formData
        })
      );

      // Should not set Content-Type for FormData (browser sets it with boundary)
      const callArgs = global.fetch.mock.calls[0][1];
      expect(callArgs.headers['Content-Type']).toBeUndefined();
    });
  });

  describe('CSV handling', () => {
    test('returns text for CSV responses', async () => {
      const csvContent = 'file,text\n001.wav,Hello';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/csv' }),
        text: () => Promise.resolve(csvContent)
      });

      const result = await api.get('/export?format=csv');

      expect(result.data).toBe(csvContent);
    });
  });
});
