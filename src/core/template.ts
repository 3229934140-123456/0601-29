import { Environment, AuthConfig, EnvVariable } from '../types';

export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key) => {
    if (key in variables) {
      return variables[key];
    }
    return match;
  });
}

export function renderObject<T = any>(obj: T, variables: Record<string, string>): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    return renderTemplate(obj, variables) as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => renderObject(item, variables)) as unknown as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj as Record<string, any>)) {
      result[key] = renderObject(value, variables);
    }
    return result as unknown as T;
  }
  return obj;
}

export function buildEnvVariables(env: Environment): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [key, val] of Object.entries(env.variables)) {
    vars[key] = (val as EnvVariable).value;
  }
  vars['baseUrl'] = env.baseUrl;
  vars['env'] = env.name;
  return vars;
}
