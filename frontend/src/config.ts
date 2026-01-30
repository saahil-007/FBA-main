const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  
  if (envUrl) return envUrl;

  // Fallback for local development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }

  // If we are accessing via an IP or custom domain and no env var is set
  return `http://${window.location.hostname}:8000`;
};

export const API_URL = getApiUrl();
