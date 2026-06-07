import { AuthConfig } from '../types';

export function applyAuth(headers: Record<string, string>, auth?: AuthConfig): Record<string, string> {
  const result = { ...headers };
  if (!auth || auth.type === 'none') {
    return result;
  }

  switch (auth.type) {
    case 'bearer':
      if (auth.bearer?.token) {
        const prefix = auth.bearer.prefix || 'Bearer';
        result['Authorization'] = prefix + ' ' + auth.bearer.token;
      }
      break;

    case 'basic':
      if (auth.basic?.username && auth.basic?.password !== undefined) {
        const credentials = auth.basic.username + ':' + auth.basic.password;
        result['Authorization'] = 'Basic ' + Buffer.from(credentials).toString('base64');
      }
      break;

    case 'api-key':
      if (auth.apiKey?.key && auth.apiKey?.value) {
        if (auth.apiKey.in === 'header') {
          result[auth.apiKey.key] = auth.apiKey.value;
        }
      }
      break;

    case 'oauth2':
      break;
  }

  return result;
}

export function applyAuthToParams(params: Record<string, string>, auth?: AuthConfig): Record<string, string> {
  const result = { ...params };
  if (!auth || auth.type !== 'api-key') {
    return result;
  }

  if (auth.apiKey?.key && auth.apiKey?.value && auth.apiKey.in === 'query') {
    result[auth.apiKey.key] = auth.apiKey.value;
  }

  return result;
}

export function mergeAuth(...auths: (AuthConfig | undefined)[]): AuthConfig | undefined {
  for (const auth of auths) {
    if (auth && auth.type !== 'none') {
      return auth;
    }
  }
  return undefined;
}
