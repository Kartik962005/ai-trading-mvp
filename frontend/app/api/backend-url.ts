const LOCAL_BACKEND_URL = 'http://127.0.0.1:8000';
const PUBLIC_BACKEND_URL = 'https://ai-trading-backend-jhcl.onrender.com';

function cleanUrl(value: string) {
  return value.replace(/\/+$/, '');
}

export function getBackendBaseUrl() {
  const explicitUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;

  if (explicitUrl) {
    return cleanUrl(explicitUrl);
  }

  const isDeployed = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  return isDeployed ? PUBLIC_BACKEND_URL : LOCAL_BACKEND_URL;
}
