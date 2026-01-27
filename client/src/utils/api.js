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

  /**
   * Upload with progress tracking using XMLHttpRequest
   * @param {string} path - API endpoint
   * @param {FormData} formData - Form data to upload
   * @param {Object} options - Options
   * @param {function} options.onProgress - Progress callback (0-100)
   * @returns {Promise<{data: any}>}
   */
  upload(path, formData, options = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const token = localStorage.getItem('token');

      xhr.open('POST', `${API_BASE}${path}`);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      // Track upload progress
      if (options.onProgress) {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            options.onProgress(percent);
          }
        });
      }

      xhr.addEventListener('load', () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ data: json });
          } else {
            const error = new Error(json.error || json.message || 'Upload failed');
            error.status = xhr.status;
            error.data = json;
            reject(error);
          }
        } catch (e) {
          reject(new Error('Invalid response from server'));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload cancelled'));
      });

      xhr.send(formData);
    });
  }
}

export default new ApiClient();
