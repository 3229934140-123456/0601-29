export interface ApiConfig {
  name: string;
  version: string;
  description?: string;
  currentEnv: string;
  sensitiveKeys: string[];
  auth?: AuthConfig;
}

export interface Environment {
  name: string;
  baseUrl: string;
  variables: Record<string, EnvVariable>;
  auth?: AuthConfig;
}

export interface EnvVariable {
  value: string;
  secret?: boolean;
  description?: string;
}

export type AuthType = 'none' | 'bearer' | 'basic' | 'api-key' | 'oauth2';

export interface AuthConfig {
  type: AuthType;
  bearer?: {
    token: string;
    prefix?: string;
  };
  basic?: {
    username: string;
    password: string;
  };
  apiKey?: {
    key: string;
    value: string;
    in: 'header' | 'query';
  };
}

export interface ApiGroup {
  id: string;
  name: string;
  description?: string;
  endpoints: ApiEndpoint[];
  subgroups?: ApiGroup[];
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export interface ApiEndpoint {
  id: string;
  name: string;
  description?: string;
  method: HttpMethod;
  path: string;
  groupId?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  headers?: Record<string, string>;
  auth?: AuthConfig;
  assertions?: Assertion[];
  examples?: Example[];
  favorite?: boolean;
}

export interface Parameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: any;
  example?: any;
}

export interface RequestBody {
  contentType: string;
  schema?: any;
  examples?: Record<string, any>;
}

export interface Assertion {
  id: string;
  name: string;
  type: 'status' | 'body' | 'header' | 'time' | 'json-path';
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'regex' | 'exists';
  value: any;
  path?: string;
  enabled?: boolean;
}

export interface Example {
  id: string;
  name: string;
  description?: string;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
  expectedResponse?: any;
}

export interface RequestResult {
  id: string;
  timestamp: number;
  endpointId: string;
  endpointName: string;
  method: HttpMethod;
  url: string;
  request: {
    headers: Record<string, string>;
    body?: any;
    params?: Record<string, string>;
  };
  response: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: any;
    time: number;
    size: number;
  };
  assertions: AssertionResult[];
  success: boolean;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actual?: any;
  expected?: any;
  message?: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  endpointId?: string;
  endpointName: string;
  method: HttpMethod;
  url: string;
  request: {
    headers: Record<string, string>;
    body?: any;
    params?: Record<string, string>;
    queryParams?: Record<string, string>;
    pathParams?: Record<string, string>;
    exampleId?: string;
    exampleName?: string;
  };
  response: {
    status: number;
    time: number;
  };
  success: boolean;
}

export interface RunResult {
  id: string;
  timestamp: number;
  name: string;
  total: number;
  passed: number;
  failed: number;
  results: RequestResult[];
  duration: number;
}

export interface DiffResult {
  field: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: any;
  newValue?: any;
  path: string;
}

export type ExportFormat = 'json' | 'yaml' | 'postman' | 'curl';
