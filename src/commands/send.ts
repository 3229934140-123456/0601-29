const chalk = require('chalk');
import * as inquirer from 'inquirer';
const ora = require('ora');
const Table = require('cli-table3');
import { ApiEndpoint, Environment, RequestResult, Example, HistoryEntry } from '../types';
import {
  ensureProject,
  loadConfig,
  loadEnvironment,
  loadEndpoints,
  findEndpointByNameOrId,
  appendHistory,
  saveEndpoint,
} from '../core/config';
import { sendRequest, formatTime, formatSize } from '../core/request';
import { maskSensitiveData, maskHeaders } from '../core/mask';

interface SendOptions {
  env?: string;
  example?: string;
  body?: string;
  query?: string;
  header?: string[];
  showHeaders?: boolean;
  noMask?: boolean;
  save?: boolean;
  quiet?: boolean;
  output?: string;
}

export async function sendEndpoint(cwd: string, query: string, options: SendOptions): Promise<RequestResult | null> {
  ensureProject(cwd);
  const config = loadConfig(cwd);

  const envName = options.env || config.currentEnv;
  const env = loadEnvironment(envName, cwd);
  if (!env) {
    console.log(chalk.red('环境 "' + envName + '" 不存在'));
    return null;
  }

  const endpoint = findEndpointByNameOrId(query, cwd);
  if (!endpoint) {
    console.log(chalk.red('未找到接口: ' + query));
    console.log(chalk.gray('使用 "apim list" 查看所有接口'));
    return null;
  }

  let selectedExample: Example | undefined;
  if (options.example && endpoint.examples) {
    selectedExample = endpoint.examples.find(function(e) {
      return e.id === options.example || e.name === options.example;
    });
    if (!selectedExample) {
      console.log(chalk.yellow('未找到示例 "' + options.example + '"'));
    }
  }

  const sendOpts: any = { env: env, endpoint: endpoint, example: selectedExample };

  if (options.body) {
    try {
      sendOpts.body = JSON.parse(options.body);
    } catch (e) {
      sendOpts.body = options.body;
    }
  }

  if (options.query) {
    const params: Record<string, string> = {};
    options.query.split('&').forEach(function(pair) {
      const parts = pair.split('=');
      const key = parts[0];
      const val = parts.slice(1).join('=');
      if (key) params[key] = val || '';
    });
    sendOpts.queryParams = params;
  }

  if (options.header && options.header.length > 0) {
    const headers: Record<string, string> = {};
    for (const h of options.header) {
      const colonIndex = h.indexOf(':');
      if (colonIndex > 0) {
        const key = h.slice(0, colonIndex).trim();
        const val = h.slice(colonIndex + 1).trim();
        headers[key] = val;
      }
    }
    sendOpts.headers = headers;
  }

  const spinner = ora('发送请求中...').start();
  try {
    const result = await sendRequest(sendOpts);
    spinner.stop();

    if (!options.quiet) {
      printResult(result, options, config.sensitiveKeys, options.showHeaders, options.noMask);
    }

    const historyEntry: HistoryEntry = {
      id: result.id,
      timestamp: result.timestamp,
      endpointId: result.endpointId,
      endpointName: result.endpointName,
      method: result.method,
      url: result.url,
      request: {
        headers: result.request.headers,
        body: result.request.body,
      },
      response: {
        status: result.response.status,
        time: result.response.time,
      },
      success: result.success,
    };
    appendHistory(historyEntry, cwd);

    return result;
  } catch (error: any) {
    spinner.stop();
    console.log(chalk.red('请求失败: ' + error.message));
    return null;
  }
}

export async function sendInteractive(cwd: string, options: SendOptions): Promise<RequestResult | null> {
  ensureProject(cwd);
  const endpoints = loadEndpoints(cwd);

  if (endpoints.length === 0) {
    console.log(chalk.yellow('暂无接口，请先添加接口'));
    return null;
  }

  const choices = endpoints.map(function(e) {
    const star = e.favorite ? '* ' : '';
    const method = chalk.cyan(e.method.padEnd(7));
    const name = e.name;
    const p = chalk.gray(e.path);
    return {
      name: star + method + ' ' + name + ' ' + p,
      value: e.id,
      short: e.name,
    };
  });

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'endpointId',
      message: '选择接口:',
      choices: choices,
      pageSize: 15,
    },
  ]);

  return sendEndpoint(cwd, answer.endpointId, options);
}

export function listEndpoints(cwd: string, options: { group?: string; tag?: string; favorite?: boolean; search?: string }): void {
  ensureProject(cwd);
  let endpoints = loadEndpoints(cwd);

  if (options.favorite) {
    endpoints = endpoints.filter(function(e) { return e.favorite; });
  }
  if (options.group) {
    endpoints = endpoints.filter(function(e) { return e.groupId === options.group; });
  }
  if (options.tag) {
    endpoints = endpoints.filter(function(e) { return e.tags && e.tags.indexOf(options.tag!) >= 0; });
  }
  if (options.search) {
    const q = options.search.toLowerCase();
    endpoints = endpoints.filter(function(e) {
      return e.name.toLowerCase().indexOf(q) >= 0 ||
        e.path.toLowerCase().indexOf(q) >= 0 ||
        (e.description && e.description.toLowerCase().indexOf(q) >= 0);
    });
  }

  if (endpoints.length === 0) {
    console.log(chalk.yellow('未找到匹配的接口'));
    return;
  }

  const table = new Table({
    head: [chalk.cyan(''), chalk.cyan('方法'), chalk.cyan('名称'), chalk.cyan('路径'), chalk.cyan('分组')],
    colWidths: [3, 8, 25, 40, 15],
    wordWrap: true,
  });

  for (const ep of endpoints) {
    const methodColor = getMethodColor(ep.method);
    table.push([
      ep.favorite ? '*' : '',
      methodColor(ep.method),
      ep.name,
      chalk.gray(ep.path),
      ep.groupId ? ep.groupId : '',
    ]);
  }

  console.log(table.toString());
  console.log(chalk.gray('共 ' + endpoints.length + ' 个接口'));
}

export async function toggleFavorite(cwd: string, query: string): Promise<void> {
  ensureProject(cwd);
  const endpoint = findEndpointByNameOrId(query, cwd);
  if (!endpoint) {
    console.log(chalk.red('未找到接口: ' + query));
    return;
  }

  endpoint.favorite = !endpoint.favorite;
  saveEndpoint(endpoint, cwd);
  const msg = endpoint.favorite
    ? '* 已收藏 "' + endpoint.name + '"'
    : '已取消收藏 "' + endpoint.name + '"';
  console.log(chalk.green(msg));
}

function printResult(
  result: RequestResult,
  options: SendOptions,
  sensitiveKeys: string[],
  showHeaders?: boolean,
  noMask?: boolean
): void {
  console.log('');
  const statusColor = getStatusColor(result.response.status);
  console.log(
    chalk.bold(statusColor(result.method + ' ' + result.url + '\n'))
  );
  console.log(
    statusColor(result.response.status + ' ' + result.response.statusText) + ' ' +
    chalk.gray('(' + formatTime(result.response.time) + ' / ' + formatSize(result.response.size) + ')')
  );
  console.log('');

  if (showHeaders) {
    console.log(chalk.cyan('请求头:'));
    const reqHeaders = noMask ? result.request.headers : maskHeaders(result.request.headers, sensitiveKeys);
    for (const [key, val] of Object.entries(reqHeaders)) {
      console.log('  ' + chalk.yellow(key) + ': ' + val);
    }
    console.log('');

    console.log(chalk.cyan('响应头:'));
    const resHeaders = noMask ? result.response.headers : maskHeaders(result.response.headers as any, sensitiveKeys);
    for (const [key, val] of Object.entries(resHeaders)) {
      console.log('  ' + chalk.yellow(key) + ': ' + val);
    }
    console.log('');
  }

  console.log(chalk.cyan('响应体:'));
  const body = result.response.body;
  if (typeof body === 'object' && body !== null) {
    const displayBody = noMask ? body : maskSensitiveData(body, sensitiveKeys);
    console.log(JSON.stringify(displayBody, null, 2));
  } else {
    console.log(body || '(空)');
  }
  console.log('');

  if (result.assertions && result.assertions.length > 0) {
    console.log(chalk.cyan('断言结果:'));
    const table = new Table({
      head: [chalk.cyan('状态'), chalk.cyan('名称'), chalk.cyan('实际值'), chalk.cyan('预期值')],
      colWidths: [6, 30, 30, 30],
    });

    for (const assertion of result.assertions) {
      table.push([
        assertion.passed ? chalk.green('PASS') : chalk.red('FAIL'),
        assertion.assertion.name,
        formatValue(assertion.actual),
        formatValue(assertion.expected),
      ]);
    }
    console.log(table.toString());

    const passed = result.assertions.filter(function(a) { return a.passed; }).length;
    const total = result.assertions.length;
    console.log(chalk.gray('断言结果: ' + passed + '/' + total + ' 通过'));
    console.log('');
  }

  if (result.success) {
    console.log(chalk.green('请求成功'));
  } else {
    console.log(chalk.red('请求失败'));
  }
  console.log('');
}

function formatValue(val: any): string {
  if (val === undefined || val === null) return '-';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function getMethodColor(method: string): (s: string) => string {
  const colors: Record<string, (s: string) => string> = {
    GET: chalk.green,
    POST: chalk.blue,
    PUT: chalk.yellow,
    DELETE: chalk.red,
    PATCH: chalk.magenta,
    HEAD: chalk.gray,
    OPTIONS: chalk.cyan,
  };
  return colors[method] || chalk.white;
}

function getStatusColor(status: number): (s: string) => string {
  if (status >= 200 && status < 300) return chalk.green;
  if (status >= 300 && status < 400) return chalk.yellow;
  if (status >= 400 && status < 500) return chalk.red;
  if (status >= 500) return chalk.magenta;
  return chalk.gray;
}
