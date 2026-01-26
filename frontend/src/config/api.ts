import axios from 'axios';

// Get API base URL from environment variable
// In production (Vercel), this should be set to your Render backend URL
// Example: https://your-backend.onrender.com
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// Validate API_BASE_URL
if (!API_BASE_URL) {
  console.warn('⚠️ VITE_API_BASE_URL is not set. Using default: http://localhost:5000');
}

// Create axios instance with base URL
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout for API calls
});

// Request interceptor: Attach JWT token from localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle 401 errors (unauthorized)
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect if we're already on the login endpoint (let the login page handle the error)
      const isLoginEndpoint = error.config?.url?.includes('/auth/login');
      if (!isLoginEndpoint) {
        // Token is invalid or expired
        localStorage.removeItem('token');
        // Redirect to signin page
        window.location.href = '/signin';
      }
    }
    return Promise.reject(error);
  }
);

export default api;

