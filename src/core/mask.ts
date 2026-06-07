const DEFAULT_SENSITIVE_KEYS = [
  'password',
  'token',
  'secret',
  'api_key',
  'apikey',
  'authorization',
  'cookie',
  'private_key',
  'access_token',
  'refresh_token',
  'client_secret',
];

export function maskSensitiveData(obj: any, sensitiveKeys: string[] = []): any {
  const allKeys = [...DEFAULT_SENSITIVE_KEYS, ...sensitiveKeys.map(k => k.toLowerCase())];

  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => maskSensitiveData(item, sensitiveKeys));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (allKeys.some(k => lowerKey.includes(k))) {
      result[key] = maskValue(value);
    } else {
      result[key] = maskSensitiveData(value, sensitiveKeys);
    }
  }
  return result;
}

function maskValue(value: any): string {
  if (typeof value === 'string') {
    if (value.length <= 4) {
      return '****';
    }
    if (value.length <= 10) {
      return value.slice(0, 2) + '****' + value.slice(-2);
    }
    return value.slice(0, 4) + '****' + value.slice(-4);
  }
  return '****';
}

export function maskHeaders(headers: Record<string, string>, sensitiveKeys: string[] = []): Record<string, string> {
  const allKeys = [...DEFAULT_SENSITIVE_KEYS, ...sensitiveKeys.map(k => k.toLowerCase())];
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (allKeys.some(k => key.toLowerCase().includes(k))) {
      result[key] = maskValue(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
