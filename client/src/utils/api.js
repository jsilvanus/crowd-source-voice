const API_BASE = '/api';

class ApiClient {
  async request(method, path, data = null, options = {}) {
    const token = localStorage.getItem('token');

    const config = {
      method,
      headers: {
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers
      }
    };

    // Don't set Content-Type for FormData (browser will set it with boundary)
    if (data && !(data instanceof FormData)) {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(data);
    } else if (data instanceof FormData) {
      config.body = data;
    }

    const response = await fetch(`${API_BASE}${path}`, config);

    // Handle non-JSON responses (like CSV downloads)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/csv')) {
      if (!response.ok) {
        throw new Error('Failed to download');
      }
      return {
        data: await response.text(),
        headers: response.headers
      };
    }

    const json = await response.json();

    if (!response.ok) {
      const error = new Error(json.error || json.message || 'Request failed');
      error.status = response.status;
      error.data = json;
      throw error;
    }

    return { data: json };
  }

  get(path) {
    return this.request('GET', path);
  }

  post(path, data) {
    return this.request('POST', path, data);
  }

  put(path, data) {
    return this.request('PUT', path, data);
  }

  delete(path) {
    return this.request('DELETE', path);
  }

  upload(path, formData) {
    return this.request('POST', path, formData);
  }
}

export default new ApiClient();
