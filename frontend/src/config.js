// Centralized Frontend Configuration
export const DEPLOYED_API_URL = 'https://exam-proctoring-system-vrbm.onrender.com';
export const LOCAL_API_URL = 'http://localhost:5000';

const resolveApiBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL ? String(import.meta.env.VITE_API_URL).trim() : '';

  // Check if running in browser runtime
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, protocol } = window.location;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';

    // If running on ANY deployed link (Vercel, Netlify, Render, custom domains, etc.) or over HTTPS:
    if (!isLocalhost || protocol === 'https:') {
      // Use configured remote URL if present and valid; never allow localhost in a deployed app
      if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
        return envUrl.replace(/\/+$/, '');
      }
      return DEPLOYED_API_URL;
    }
  }

  // When running locally:
  // If an environment variable is explicitly provided, respect it
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  // Default to the deployed backend so the app runs through the deployed link
  return DEPLOYED_API_URL;
};

export const API_BASE_URL = resolveApiBaseUrl();
