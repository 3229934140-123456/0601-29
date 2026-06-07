const chalk = require('chalk');
import * as diff from 'diff';
const Table = require('cli-table3');
import { RequestResult, RunResult, DiffResult } from '../types';
import {
  ensureProject,
  loadRunResult,
  listRuns,
  findEndpointByNameOrId,
  loadConfig,
  loadEnvironment,
} from '../core/config';
import { sendRequest, formatTime } from '../core/request';
import { maskSensitiveData } from '../core/mask';

interface DiffOptions {
  env?: string;
  env2?: string;
  output?: string;
  noMask?: boolean;
  run?: boolean;
}

export async function diffEndpoints(cwd: string, query: string, options: DiffOptions): Promise<void> {
  ensureProject(cwd);
  const config = loadConfig(cwd);

  const endpoint = findEndpointByNameOrId(query, cwd);
  if (!endpoint) {
    console.log(chalk.red(`未找到接口: ${query}`));
    return;
  }

  const env1Name = options.env || config.currentEnv;
  const env2Name = options.env2;

  if (!env2Name) {
    console.log(chalk.yellow('请使用 --env2 指定第二个环境'));
    return;
  }

  const env1 = loadEnvironment(env1Name, cwd);
  const env2 = loadEnvironment(env2Name, cwd);

  if (!env1) {
    console.log(chalk.red(`环境 "${env1Name}" 不存在`));
    return;
  }
  if (!env2) {
    console.log(chalk.red(`环境 "${env2Name}" 不存在`));
    return;
  }

  console.log(chalk.cyan(`\n🔄 对比接口: ${endpoint.name}`));
  console.log(chalk.gray(`  环境 A: ${env1Name} (${env1.baseUrl})`));
  console.log(chalk.gray(`  环境 B: ${env2Name} (${env2.baseUrl})\n`));

  const result1 = await sendRequest({ env: env1, endpoint });
  const result2 = await sendRequest({ env: env2, endpoint });

  printDiffSummary(result1, result2, env1Name, env2Name, options);
  compareResponses(result1, result2, options);
}

export async function diffRuns(cwd: string, runId1: string, runId2: string, options: DiffOptions): Promise<void> {
  ensureProject(cwd);

  const run1 = findRun(runId1, cwd);
  const run2 = findRun(runId2, cwd);

  if (!run1) {
    console.log(chalk.red(`未找到运行记录: ${runId1}`));
    return;
  }
  if (!run2) {
    console.log(chalk.red(`未找到运行记录: ${runId2}`));
    return;
  }

  console.log(chalk.cyan(`\n🔄 对比运行结果`));
  console.log(chalk.gray(`  运行 A: ${run1.name} (${new Date(run1.timestamp).toLocaleString()})`));
  console.log(chalk.gray(`  运行 B: ${run2.name} (${new Date(run2.timestamp).toLocaleString()})\n`));

  printRunDiffSummary(run1, run2);
  compareRunResults(run1, run2, options);
}

function findRun(id: string, cwd: string): RunResult | null {
  const runs = listRuns(cwd);
  const runFromList = runs.find(function(r) { return r.id.startsWith(id); });
  if (runFromList) {
    return runFromList;
  }
  return loadRunResult(id, cwd);
}

function printDiffSummary(
  result1: RequestResult,
  result2: RequestResult,
  env1Name: string,
  env2Name: string,
  options: DiffOptions
): void {
  const table = new Table({
    head: ['', chalk.cyan(env1Name), chalk.cyan(env2Name), chalk.cyan('差异')],
    colWidths: [12, 25, 25, 25],
  });

  table.push(
    ['状态码', result1.response.status, result2.response.status, result1.response.status === result2.response.status ? '✓' : '✗'],
    ['耗时', formatTime(result1.response.time), formatTime(result2.response.time), formatTime(Math.abs(result1.response.time - result2.response.time))],
  );

  console.log(table.toString());
  console.log('');
}

function compareResponses(result1: RequestResult, result2: RequestResult, options: DiffOptions): void {
  const body1 = typeof result1.response.body === 'object'
    ? JSON.stringify(options.noMask ? result1.response.body : maskSensitiveData(result1.response.body, []), null, 2)
    : String(result1.response.body);
  const body2 = typeof result2.response.body === 'object'
    ? JSON.stringify(options.noMask ? result2.response.body : maskSensitiveData(result2.response.body, []), null, 2)
    : String(result2.response.body);

  if (body1 === body2) {
    console.log(chalk.green('✅ 响应体完全相同'));
    return;
  }

  console.log(chalk.yellow('⚠ 响应体存在差异:\n'));

  const diffResult = diff.diffLines(body1, body2);
  let lineCount = 0;
  for (const part of diffResult) {
    if (part.added) {
      process.stdout.write(chalk.green(part.value.split('\n').map(l => '+ ' + l).join('\n')));
    } else if (part.removed) {
      process.stdout.write(chalk.red(part.value.split('\n').map(l => '- ' + l).join('\n')));
    } else {
      const lines = part.value.split('\n');
      if (lines.length > 6) {
        process.stdout.write(chalk.gray(`  ... ${lines.length - 4} 行相同 ...\n`));
      } else {
        process.stdout.write(chalk.gray(part.value.split('\n').map(l => '  ' + l).join('\n')));
      }
    }
    lineCount++;
  }
  console.log('');
}

function printRunDiffSummary(run1: RunResult, run2: RunResult): void {
  const table = new Table({
    head: ['', chalk.cyan('运行 A'), chalk.cyan('运行 B'), chalk.cyan('差异')],
    colWidths: [12, 20, 20, 20],
  });

  table.push(
    ['总数', run1.total, run2.total, Math.abs(run1.total - run2.total)],
    ['通过', chalk.green(String(run1.passed)), chalk.green(String(run2.passed)), Math.abs(run1.passed - run2.passed)],
    ['失败', chalk.red(String(run1.failed)), chalk.red(String(run2.failed)), Math.abs(run1.failed - run2.failed)],
    ['耗时', formatTime(run1.duration), formatTime(run2.duration), formatTime(Math.abs(run1.duration - run2.duration))],
  );

  console.log(table.toString());
  console.log('');
}

function compareRunResults(run1: RunResult, run2: RunResult, options: DiffOptions): void {
  console.log(chalk.cyan('📋 接口对比详情:\n'));

  const map1 = new Map(run1.results.map(r => [r.endpointId, r]));
  const map2 = new Map(run2.results.map(r => [r.endpointId, r]));
  const allIds = new Set([...map1.keys(), ...map2.keys()]);

  const table = new Table({
    head: [chalk.cyan('接口'), chalk.cyan('A 状态'), chalk.cyan('B 状态'), chalk.cyan('变化')],
    colWidths: [30, 15, 15, 20],
  });

  let changedCount = 0;
  for (const id of allIds) {
    const r1 = map1.get(id);
    const r2 = map2.get(id);

    if (!r1) {
      table.push([r2?.endpointName || id, '-', formatStatus(r2), chalk.blue('新增')]);
      changedCount++;
    } else if (!r2) {
      table.push([r1.endpointName, formatStatus(r1), '-', chalk.yellow('移除')]);
      changedCount++;
    } else if (r1.success !== r2.success) {
      table.push([
        r1.endpointName,
        formatStatus(r1),
        formatStatus(r2),
        r2.success ? chalk.green('变好') : chalk.red('变差'),
      ]);
      changedCount++;
    }
  }

  if (changedCount === 0) {
    console.log(chalk.green('✅ 所有接口结果一致'));
  } else {
    console.log(table.toString());
    console.log(chalk.gray(`\n共 ${changedCount} 个接口发生变化`));
  }
  console.log('');
}

function formatStatus(result: RequestResult | undefined): string {
  if (!result) return '-';
  return result.success
    ? chalk.green(`${result.response.status} ✓`)
    : chalk.red(`${result.response.status} ✗`);
}

export function checkChanges(cwd: string, options: DiffOptions): void {
  ensureProject(cwd);
  const runs = listRuns(cwd);

  if (runs.length < 2) {
    console.log(chalk.yellow('至少需要 2 条运行记录才能对比'));
    return;
  }

  console.log(chalk.cyan('\n🔍 变更检查: 最近两次运行对比\n'));
  const latest = runs[0];
  const previous = runs[1];

  printRunDiffSummary(latest, previous);
  compareRunResults(latest, previous, options);
}
