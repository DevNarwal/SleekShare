class ApiClient {
  private accessToken: string | null = null;
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  getAccessToken() {
    return this.accessToken;
  }

  async request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `http://localhost:3001/api${path}`;
    const headers = new Headers(options.headers || {});
    
    if (this.accessToken) {
      headers.set('Authorization', `Bearer ${this.accessToken}`);
    }
    
    if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'include',
    };

    const response = await fetch(url, config);

    if (
      response.status === 401 &&
      !path.includes('/auth/login') &&
      !path.includes('/auth/refresh') &&
      !path.includes('/auth/register')
    ) {
      try {
        const newAccessToken = await this.refresh();
        headers.set('Authorization', `Bearer ${newAccessToken}`);
        const retryResponse = await fetch(url, { ...config, headers });
        if (!retryResponse.ok) {
          throw new Error(await retryResponse.text() || retryResponse.statusText);
        }
        if (retryResponse.status === 204) return null;
        return await retryResponse.json();
      } catch (err) {
        this.setAccessToken(null);
        throw err;
      }
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = response.statusText;
      try {
        const parsed = JSON.parse(errorText);
        errorMessage = parsed.message || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  }

  private async refresh(): Promise<string> {
    if (this.isRefreshing) {
      return new Promise((resolve) => {
        this.refreshSubscribers.push(resolve);
      });
    }

    this.isRefreshing = true;

    try {
      const url = 'http://localhost:3001/api/auth/refresh';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Session expired');
      }

      const data = await response.json();
      const token = data.accessToken;
      this.setAccessToken(token);
      
      this.isRefreshing = false;
      this.refreshSubscribers.forEach((callback) => callback(token));
      this.refreshSubscribers = [];
      
      return token;
    } catch (err) {
      this.isRefreshing = false;
      this.refreshSubscribers = [];
      throw err;
    }
  }

  async get(path: string, options?: RequestInit) {
    return this.request(path, { ...options, method: 'GET' });
  }

  async post(path: string, body?: any, options?: RequestInit) {
    return this.request(path, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  async patch(path: string, body?: any, options?: RequestInit) {
    return this.request(path, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  }

  async delete(path: string, options?: RequestInit) {
    return this.request(path, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
