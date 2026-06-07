const chalk = require('chalk');
import * as inquirer from 'inquirer';
const ora = require('ora');
const Table = require('cli-table3');
import { ApiEndpoint, RunResult, RequestResult, Environment } from '../types';
import {
  ensureProject,
  loadConfig,
  loadEnvironment,
  loadEndpoints,
  loadGroups,
  saveRunResult,
  listRuns,
  loadRunResult,
  generateId,
} from '../core/config';
import { sendRequest, formatTime } from '../core/request';
import { findEndpointByNameOrId } from '../core/config';

interface RunOptions {
  env?: string;
  group?: string;
  tag?: string;
  favorite?: boolean;
  all?: boolean;
  failFast?: boolean;
  parallel?: boolean;
  name?: string;
  save?: boolean;
  quiet?: boolean;
}

export async function runCollection(cwd: string, queries: string[], options: RunOptions): Promise<RunResult | null> {
  ensureProject(cwd);
  const config = loadConfig(cwd);

  const envName = options.env || config.currentEnv;
  const env = loadEnvironment(envName, cwd);
  if (!env) {
    console.log(chalk.red(`环境 "${envName}" 不存在`));
    return null;
  }

  let endpoints: ApiEndpoint[] = [];

  if (queries && queries.length > 0) {
    for (const q of queries) {
      const ep = findEndpointByNameOrId(q, cwd);
      if (ep) {
        endpoints.push(ep);
      } else {
        console.log(chalk.yellow(`未找到接口: ${q}`));
      }
    }
  } else {
    endpoints = loadEndpoints(cwd);

    if (options.favorite) {
      endpoints = endpoints.filter(e => e.favorite);
    }
    if (options.group) {
      endpoints = endpoints.filter(e => e.groupId === options.group);
    }
    if (options.tag) {
      endpoints = endpoints.filter(e => e.tags?.includes(options.tag!));
    }
    if (options.all) {
    }
  }

  if (endpoints.length === 0) {
    console.log(chalk.yellow('没有可运行的接口'));
    return null;
  }

  console.log(chalk.cyan(`\n▶ 开始运行测试: ${options.name || '未命名'}`));
  console.log(chalk.gray(`  环境: ${envName} | 接口数: ${endpoints.length}\n`));

  const startTime = Date.now();
  const results: RequestResult[] = [];
  let passed = 0;
  let failed = 0;

  if (options.parallel) {
    const promises = endpoints.map(ep => runEndpoint(ep, env));
    const allResults = await Promise.all(promises);
    for (const result of allResults) {
      if (result) {
        results.push(result);
        if (result.success) passed++;
        else failed++;
      }
    }
  } else {
    for (let i = 0; i < endpoints.length; i++) {
      const ep = endpoints[i];
      const spinner = ora(`[${i + 1}/${endpoints.length}] ${ep.name}`).start();

      try {
        const result = await sendRequest({ env, endpoint: ep });
        results.push(result);

        if (result.success) {
          passed++;
          spinner.succeed(chalk.green(`${ep.name} - ${result.response.status}`));
        } else {
          failed++;
          spinner.fail(chalk.red(`${ep.name} - ${result.response.status}`));
        }

        if (options.failFast && !result.success) {
          console.log(chalk.yellow('\n⏹  快速失败模式，停止执行'));
          break;
        }
      } catch (error: any) {
        failed++;
        spinner.fail(chalk.red(`${ep.name} - 错误: ${error.message}`));

        if (options.failFast) break;
      }
    }
  }

  const duration = Date.now() - startTime;
  const runResult: RunResult = {
    id: generateId(),
    timestamp: Date.now(),
    name: options.name || `运行 ${new Date().toLocaleString()}`,
    total: results.length,
    passed,
    failed,
    results,
    duration,
  };

  if (options.save !== false) {
    saveRunResult(runResult, cwd);
  }

  printRunSummary(runResult);

  return runResult;
}

async function runEndpoint(endpoint: ApiEndpoint, env: Environment): Promise<RequestResult | null> {
  try {
    return await sendRequest({ env, endpoint });
  } catch {
    return null;
  }
}

function printRunSummary(result: RunResult): void {
  console.log('');
  console.log(chalk.cyan('📊 运行结果:'));
  console.log('');

  const table = new Table({
    head: [chalk.cyan('状态'), chalk.cyan('接口'), chalk.cyan('方法'), chalk.cyan('状态码'), chalk.cyan('耗时')],
    colWidths: [6, 30, 8, 12, 12],
  });

  for (const r of result.results) {
    table.push([
      r.success ? chalk.green('✓') : chalk.red('✗'),
      r.endpointName,
      r.method,
      r.response.status,
      formatTime(r.response.time),
    ]);
  }
  console.log(table.toString());

  console.log('');
  const successRate = result.total > 0 ? ((result.passed / result.total) * 100).toFixed(1) : '0';
  const statusColor = result.failed === 0 ? chalk.green : chalk.red;
  console.log(statusColor(`通过率: ${result.passed}/${result.total} (${successRate}%)`));
  console.log(chalk.gray(`总耗时: ${formatTime(result.duration)}`));
  console.log('');

  if (result.failed === 0) {
    console.log(chalk.green('🎉 全部通过!'));
  } else {
    console.log(chalk.red(`❌ ${result.failed} 个失败`));
  }
  console.log('');
}

export function listRunsCommand(cwd: string, limit: number = 10): void {
  ensureProject(cwd);
  const runs = listRuns(cwd).slice(0, limit);

  if (runs.length === 0) {
    console.log(chalk.yellow('暂无运行记录'));
    return;
  }

  const table = new Table({
    head: [chalk.cyan('ID'), chalk.cyan('名称'), chalk.cyan('时间'), chalk.cyan('总数'), chalk.cyan('通过'), chalk.cyan('失败'), chalk.cyan('耗时')],
    colWidths: [10, 25, 20, 8, 8, 8, 12],
  });

  for (const run of runs) {
    const date = new Date(run.timestamp);
    table.push([
      run.id.slice(0, 8),
      run.name,
      date.toLocaleString(),
      run.total,
      chalk.green(String(run.passed)),
      run.failed > 0 ? chalk.red(String(run.failed)) : '0',
      formatTime(run.duration),
    ]);
  }

  console.log(table.toString());
  console.log(chalk.gray(`共 ${runs.length} 条记录`));
}

export function showRunDetail(cwd: string, id: string): void {
  ensureProject(cwd);
  const runs = listRuns(cwd);
  const run = runs.find(r => r.id.startsWith(id)) || loadRunResult(id, cwd);

  if (!run) {
    console.log(chalk.red(`未找到运行记录: ${id}`));
    return;
  }

  console.log(chalk.cyan(`\n📋 运行详情: ${run.name}`));
  console.log(chalk.gray(`  ID: ${run.id}`));
  console.log(chalk.gray(`  时间: ${new Date(run.timestamp).toLocaleString()}`));
  console.log(chalk.gray(`  总耗时: ${formatTime(run.duration)}\n`));

  const table = new Table({
    head: [chalk.cyan('状态'), chalk.cyan('接口'), chalk.cyan('方法'), chalk.cyan('状态码'), chalk.cyan('耗时'), chalk.cyan('断言')],
    colWidths: [6, 25, 8, 10, 10, 10],
  });

  for (const r of run.results) {
    const assertionPassed = r.assertions.filter(a => a.passed).length;
    const assertionTotal = r.assertions.length;
    table.push([
      r.success ? chalk.green('✓') : chalk.red('✗'),
      r.endpointName,
      r.method,
      r.response.status,
      formatTime(r.response.time),
      assertionTotal > 0
        ? (assertionPassed === assertionTotal ? chalk.green(`${assertionPassed}/${assertionTotal}`) : chalk.red(`${assertionPassed}/${assertionTotal}`))
        : '-',
    ]);
  }

  console.log(table.toString());
  console.log('');
}

export async function runFavorites(cwd: string, options: RunOptions): Promise<RunResult | null> {
  return runCollection(cwd, [], { ...options, favorite: true });
}
