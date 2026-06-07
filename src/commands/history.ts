const chalk = require('chalk');
import * as inquirer from 'inquirer';
const Table = require('cli-table3');
import { HistoryEntry } from '../types';
import {
  ensureProject,
  loadHistory,
  loadConfig,
  loadEnvironment,
  findEndpointByNameOrId,
  generateId,
  appendHistory,
} from '../core/config';
import { sendRequest, formatTime } from '../core/request';
import { maskHeaders, maskSensitiveData } from '../core/mask';

interface HistoryOptions {
  limit?: number;
  showBody?: boolean;
  noMask?: boolean;
}

export function showHistory(cwd: string, options: HistoryOptions): void {
  ensureProject(cwd);
  const history = loadHistory(cwd, options.limit || 20);

  if (history.length === 0) {
    console.log(chalk.yellow('暂无历史记录'));
    return;
  }

  const table = new Table({
    head: [chalk.cyan('#'), chalk.cyan('时间'), chalk.cyan('方法'), chalk.cyan('名称'), chalk.cyan('状态'), chalk.cyan('耗时')],
    colWidths: [5, 20, 8, 25, 10, 12],
  });

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const statusColor = entry.success ? chalk.green : chalk.red;
    table.push([
      String(i + 1),
      new Date(entry.timestamp).toLocaleTimeString(),
      entry.method,
      entry.endpointName,
      statusColor(String(entry.response.status)),
      formatTime(entry.response.time),
    ]);
  }

  console.log(table.toString());
  console.log(chalk.gray(`共 ${history.length} 条记录`));
  console.log('');
  console.log(chalk.gray('使用 "apim history replay <序号>" 重放请求'));
  console.log('');
}

export function showHistoryDetail(cwd: string, index: number, options: HistoryOptions): void {
  ensureProject(cwd);
  const history = loadHistory(cwd);

  if (index < 1 || index > history.length) {
    console.log(chalk.red(`无效的序号: ${index}`));
    return;
  }

  const entry = history[index - 1];
  const config = loadConfig(cwd);

  console.log('');
  console.log(chalk.cyan(`📋 历史记录详情 #${index}`));
  console.log(chalk.gray(`  时间: ${new Date(entry.timestamp).toLocaleString()}`));
  console.log(chalk.gray(`  接口: ${entry.endpointName}`));
  console.log('');

  const statusColor = entry.success ? chalk.green : chalk.red;
  console.log(`${entry.method} ${entry.url}`);
  console.log(statusColor(`${entry.response.status} (${formatTime(entry.response.time)})`));
  console.log('');

  console.log(chalk.cyan('📤 请求头:'));
  const reqHeaders = options.noMask
    ? entry.request.headers
    : maskHeaders(entry.request.headers, config.sensitiveKeys);
  for (const [key, val] of Object.entries(reqHeaders)) {
    console.log(`  ${chalk.yellow(key)}: ${val}`);
  }
  console.log('');

  if (options.showBody && entry.request.body) {
    console.log(chalk.cyan('📤 请求体:'));
    const body = entry.request.body;
    if (typeof body === 'object') {
      const displayBody = options.noMask ? body : maskSensitiveData(body, config.sensitiveKeys);
      console.log(JSON.stringify(displayBody, null, 2));
    } else {
      console.log(body);
    }
    console.log('');
  }

  console.log(chalk.gray('使用 "apim history replay ' + index + '" 重放此请求'));
  console.log('');
}

export async function replayHistory(cwd: string, index: number, options: { env?: string }): Promise<void> {
  ensureProject(cwd);
  const history = loadHistory(cwd);

  if (index < 1 || index > history.length) {
    console.log(chalk.red('无效的序号: ' + index));
    return;
  }

  const entry = history[index - 1];
  const config = loadConfig(cwd);
  const envName = options.env || config.currentEnv;
  const env = loadEnvironment(envName, cwd);

  if (!env) {
    console.log(chalk.red('环境 "' + envName + '" 不存在'));
    return;
  }

  let originalPath = entry.url;
  if (entry.url.indexOf('://') >= 0) {
    var pathStart = entry.url.indexOf('/', entry.url.indexOf('://') + 3);
    if (pathStart >= 0) {
      originalPath = entry.url.substring(pathStart);
    }
  }

  var queryIndex = originalPath.indexOf('?');
  var basePath = queryIndex >= 0 ? originalPath.substring(0, queryIndex) : originalPath;

  var endpoint = {
    id: entry.endpointId || generateId(),
    name: entry.endpointName,
    method: entry.method,
    path: basePath,
    headers: {},
  } as any;

  console.log(chalk.cyan('\n重放请求: ' + entry.endpointName));
  console.log(chalk.gray('  环境: ' + envName));
  console.log(chalk.gray('  原始URL: ' + entry.url));
  console.log('');

  var replayHeaders = entry.request.headers || {};
  var replayBody = entry.request.body;
  var replayQueryParams = entry.request.params || entry.request.queryParams || {};

  var result = await sendRequest({
    env: env,
    endpoint: endpoint,
    body: replayBody,
    headers: replayHeaders,
    queryParams: replayQueryParams,
  });

  var newEntry = {
    id: result.id,
    timestamp: result.timestamp,
    endpointId: result.endpointId,
    endpointName: result.endpointName,
    method: result.method,
    url: result.url,
    request: {
      headers: result.request.headers,
      body: result.request.body,
      params: result.request.params,
      queryParams: result.request.params,
    },
    response: {
      status: result.response.status,
      time: result.response.time,
    },
    success: result.success,
  } as HistoryEntry;
  appendHistory(newEntry, cwd);

  var statusColor = result.success ? chalk.green : chalk.red;
  console.log(statusColor('  ' + result.response.status + ' ' + result.response.statusText));
  console.log(chalk.gray('  耗时: ' + formatTime(result.response.time)));
  console.log(chalk.gray('  URL: ' + result.url));
  console.log('');

  if (result.success) {
    console.log(chalk.green('重放成功'));
  } else {
    console.log(chalk.red('重放失败'));
  }
  console.log('');
}

export function clearHistory(cwd: string, force?: boolean): void {
  if (!force) {
    console.log(chalk.yellow('使用 --force 确认清空历史记录'));
    return;
  }

  const { loadHistory } = require('../core/config');
  try {
    const fs = require('fs');
    const path = require('path');
    const historyPath = path.join(cwd, '.apim', 'history.json');
    if (fs.existsSync(historyPath)) {
      fs.writeFileSync(historyPath, '[]', 'utf-8');
    }
    console.log(chalk.green('✅ 历史记录已清空'));
  } catch (error: any) {
    console.log(chalk.red('清空失败: ' + error.message));
  }
}
