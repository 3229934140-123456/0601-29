import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ApiEndpoint, Environment, RequestResult, Example } from '../types';
import { buildEnvVariables, renderObject, renderTemplate } from './template';
import { applyAuth, mergeAuth } from './auth';
import { runAssertions } from './assertions';
import { generateId } from './config';

export interface SendOptions {
  env: Environment;
  endpoint: ApiEndpoint;
  example?: Example;
  pathParams?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: any;
  headers?: Record<string, string>;
  timeout?: number;
  verifySSL?: boolean;
}

export async function sendRequest(options: SendOptions): Promise<RequestResult> {
  const { env, endpoint, example, pathParams, queryParams, body, headers, timeout, verifySSL } = options;
  const variables = buildEnvVariables(env);
  const startTime = Date.now();

  let fullPath = endpoint.path;
  let reqBody = body || endpoint.requestBody?.examples?.default || example?.body;
  let reqHeaders: Record<string, string> = { ...endpoint.headers, ...headers };
  let reqParams: Record<string, string> = { ...queryParams };

  if (example) {
    if (example.pathParams) {
      for (const [k, v] of Object.entries(example.pathParams)) {
        variables[k] = v;
      }
    }
    if (example.queryParams) {
      reqParams = { ...example.queryParams, ...reqParams };
    }
    if (example.headers) {
      reqHeaders = { ...example.headers, ...reqHeaders };
    }
    if (example.body) {
      reqBody = example.body;
    }
  }

  if (pathParams) {
    for (const [k, v] of Object.entries(pathParams)) {
      variables[k] = v;
    }
  }

  fullPath = renderTemplate(fullPath, variables);
  const url = `${env.baseUrl}${fullPath}`;
  reqParams = renderObject(reqParams, variables);
  reqHeaders = renderObject(reqHeaders, variables);

  const authConfig = mergeAuth(endpoint.auth, env.auth);
  reqHeaders = applyAuth(reqHeaders, authConfig);

  if (reqBody && !reqHeaders['Content-Type'] && !reqHeaders['content-type']) {
    if (typeof reqBody === 'object') {
      reqHeaders['Content-Type'] = 'application/json';
    }
  }

  const axiosConfig: AxiosRequestConfig = {
    method: endpoint.method.toLowerCase() as any,
    url: renderTemplate(url, variables),
    headers: reqHeaders,
    params: reqParams,
    timeout: timeout || 30000,
    validateStatus: () => true,
  };

  if (reqBody !== undefined) {
    if (typeof reqBody === 'object' && reqBody !== null) {
      axiosConfig.data = renderObject(reqBody, variables);
    } else {
      axiosConfig.data = renderTemplate(String(reqBody), variables);
    }
  }

  if (verifySSL === false) {
    (axiosConfig as any).httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });
  }

  let response: AxiosResponse;
  try {
    response = await axios(axiosConfig);
  } catch (error: any) {
    if (error.response) {
      response = error.response;
    } else {
      throw error;
    }
  }

  const endTime = Date.now();
  const responseTime = endTime - startTime;

  const responseBody = typeof response.data === 'string' ? response.data : response.data;
  const responseSize = calculateResponseSize(response.data, response.headers);

  const result: RequestResult = {
    id: generateId(),
    timestamp: Date.now(),
    endpointId: endpoint.id,
    endpointName: endpoint.name,
    method: endpoint.method,
    url: axiosConfig.url as string,
    request: {
      headers: reqHeaders,
      body: axiosConfig.data,
      params: reqParams,
    },
    response: {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers as Record<string, string>,
      body: responseBody,
      time: responseTime,
      size: responseSize,
    },
    assertions: [],
    success: response.status >= 200 && response.status < 400,
  };

  if (endpoint.assertions && endpoint.assertions.length > 0) {
    result.assertions = runAssertions(endpoint.assertions, result);
    result.success = result.assertions.every(a => a.passed);
  }

  return result;
}

function calculateResponseSize(body: any, headers: Record<string, any>): number {
  if (headers['content-length']) {
    return parseInt(headers['content-length'], 10);
  }
  if (typeof body === 'string') {
    return Buffer.byteLength(body, 'utf-8');
  }
  if (body !== null && body !== undefined) {
    return Buffer.byteLength(JSON.stringify(body), 'utf-8');
  }
  return 0;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatTime(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}
