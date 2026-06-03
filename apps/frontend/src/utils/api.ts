import { useStore } from "../store/useStore";

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

const handleResponse = async (response: Response) => {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }
  return data;
};

export const api = {
  request: async (url: string, options: RequestOptions = {}): Promise<any> => {
    const { accessToken, setAuth, clearAuth } = useStore.getState();
    const headers = new Headers(options.headers || {});

    // Set default JSON headers
    if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    // Set JWT Bearer Token
    if (accessToken && !options.skipAuth) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    options.headers = headers;

    try {
      const response = await fetch(url, options);

      // Handle 401 Unauthorized (attempt token refresh)
      if (response.status === 401 && accessToken && !options.skipAuth) {
        console.log("[API] Access token expired. Attempting silent token refresh...");
        
        try {
          const refreshRes = await fetch("/auth/refresh", { method: "POST" });
          const refreshData = await refreshRes.json();

          if (refreshRes.ok && refreshData.accessToken) {
            // Update token in Zustand and retry original request
            const { user } = useStore.getState();
            setAuth(user, refreshData.accessToken);
            
            // Re-bind new header and retry
            headers.set("Authorization", `Bearer ${refreshData.accessToken}`);
            options.headers = headers;
            const retryResponse = await fetch(url, options);
            return await handleResponse(retryResponse);
          } else {
            // Refresh token expired or revoked. Force logout.
            console.warn("[API] Refresh token expired or invalid. Revoking session.");
            clearAuth();
            throw new Error("Session expired. Please log in again.");
          }
        } catch (refreshErr) {
          clearAuth();
          throw refreshErr;
        }
      }

      return await handleResponse(response);
    } catch (error) {
      throw error;
    }
  },

  get: (url: string, options?: RequestOptions) => api.request(url, { ...options, method: "GET" }),
  post: (url: string, body?: any, options?: RequestOptions) =>
    api.request(url, { ...options, method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: (url: string, body?: any, options?: RequestOptions) =>
    api.request(url, { ...options, method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: (url: string, options?: RequestOptions) => api.request(url, { ...options, method: "DELETE" }),
};
export default api;
