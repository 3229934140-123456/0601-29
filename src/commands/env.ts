const chalk = require('chalk');
import * as inquirer from 'inquirer';
const Table = require('cli-table3');
import { Environment, EnvVariable, AuthType, AuthConfig } from '../types';
import {
  ensureProject,
  loadConfig,
  saveConfig,
  loadEnvironments,
  loadEnvironment,
  saveEnvironment,
  deleteEnvironment,
} from '../core/config';

export function listEnvironments(cwd: string): void {
  ensureProject(cwd);
  const config = loadConfig(cwd);
  const envs = loadEnvironments(cwd);

  if (envs.length === 0) {
    console.log(chalk.yellow('暂无环境配置'));
    return;
  }

  const table = new Table({
    head: [chalk.cyan('名称'), chalk.cyan('地址'), chalk.cyan('变量数'), chalk.cyan('鉴权'), chalk.cyan('状态')],
    colWidths: [15, 40, 10, 15, 10],
  });

  for (const env of envs) {
    const isCurrent = env.name === config.currentEnv;
    table.push([
      isCurrent ? chalk.green(env.name + ' *') : env.name,
      env.baseUrl,
      Object.keys(env.variables).length,
      env.auth?.type || 'none',
      isCurrent ? chalk.green('当前') : '',
    ]);
  }

  console.log(table.toString());
  console.log(chalk.gray(`共 ${envs.length} 个环境`));
}

export function useEnvironment(cwd: string, name: string): void {
  ensureProject(cwd);
  const env = loadEnvironment(name, cwd);
  if (!env) {
    console.log(chalk.red(`环境 "${name}" 不存在`));
    return;
  }

  const config = loadConfig(cwd);
  config.currentEnv = name;
  saveConfig(config, cwd);

  console.log(chalk.green(`✅ 已切换到环境: ${name}`));
  console.log(chalk.gray(`   地址: ${env.baseUrl}`));
}

export async function addEnvironment(cwd: string, name?: string): Promise<void> {
  ensureProject(cwd);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '环境名称:',
      default: name || 'staging',
      when: !name,
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: 'API 基础地址:',
      default: 'http://staging.example.com',
    },
  ]);

  const envName = name || answers.name;
  if (loadEnvironment(envName, cwd)) {
    console.log(chalk.red(`环境 "${envName}" 已存在`));
    return;
  }

  const env: Environment = {
    name: envName,
    baseUrl: answers.baseUrl,
    variables: {},
    auth: { type: 'none' },
  };

  saveEnvironment(env, cwd);
  console.log(chalk.green(`✅ 环境 "${envName}" 已创建`));
}

export async function removeEnvironment(cwd: string, name: string, force?: boolean): Promise<void> {
  ensureProject(cwd);

  if (!loadEnvironment(name, cwd)) {
    console.log(chalk.red(`环境 "${name}" 不存在`));
    return;
  }

  if (!force) {
    const answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: `确定要删除环境 "${name}" 吗?`,
        default: false,
      },
    ]);
    if (!answer.confirm) {
      console.log(chalk.gray('已取消'));
      return;
    }
  }

  deleteEnvironment(name, cwd);

  const config = loadConfig(cwd);
  if (config.currentEnv === name) {
    const envs = loadEnvironments(cwd);
    config.currentEnv = envs.length > 0 ? envs[0].name : '';
    saveConfig(config, cwd);
  }

  console.log(chalk.green(`✅ 环境 "${name}" 已删除`));
}

export function showEnvironment(cwd: string, name?: string): void {
  ensureProject(cwd);
  const config = loadConfig(cwd);
  const envName = name || config.currentEnv;
  const env = loadEnvironment(envName, cwd);

  if (!env) {
    console.log(chalk.red(`环境 "${envName}" 不存在`));
    return;
  }

  console.log(chalk.cyan(`\n📋 环境详情: ${envName}`));
  console.log(chalk.gray(`   地址: ${env.baseUrl}`));
  console.log(chalk.gray(`   鉴权: ${env.auth?.type || 'none'}\n`));

  const vars = Object.entries(env.variables);
  if (vars.length === 0) {
    console.log(chalk.yellow('  暂无变量'));
  } else {
    const table = new Table({
      head: [chalk.cyan('变量名'), chalk.cyan('值'), chalk.cyan('描述')],
      colWidths: [20, 40, 30],
    });

    for (const [key, val] of vars) {
      const v = val as EnvVariable;
      const displayValue = v.secret ? maskValue(v.value) : v.value;
      table.push([
        v.secret ? chalk.yellow(key + ' 🔒') : key,
        v.secret ? chalk.gray(displayValue) : displayValue,
        v.description || '',
      ]);
    }

    console.log(table.toString());
  }
  console.log('');
}

export async function setVariable(cwd: string, key: string, value: string, options: { secret?: boolean; env?: string; desc?: string }): Promise<void> {
  ensureProject(cwd);
  const config = loadConfig(cwd);
  const envName = options.env || config.currentEnv;
  const env = loadEnvironment(envName, cwd);

  if (!env) {
    console.log(chalk.red(`环境 "${envName}" 不存在`));
    return;
  }

  const existing = env.variables[key] as EnvVariable | undefined;
  env.variables[key] = {
    value,
    secret: options.secret ?? existing?.secret ?? false,
    description: options.desc || existing?.description,
  };

  saveEnvironment(env, cwd);
  console.log(chalk.green(`✅ 变量 "${key}" 已设置`));
}

export async function unsetVariable(cwd: string, key: string, options: { env?: string }): Promise<void> {
  ensureProject(cwd);
  const config = loadConfig(cwd);
  const envName = options.env || config.currentEnv;
  const env = loadEnvironment(envName, cwd);

  if (!env) {
    console.log(chalk.red(`环境 "${envName}" 不存在`));
    return;
  }

  if (!(key in env.variables)) {
    console.log(chalk.yellow(`变量 "${key}" 不存在`));
    return;
  }

  delete env.variables[key];
  saveEnvironment(env, cwd);
  console.log(chalk.green(`✅ 变量 "${key}" 已删除`));
}

export async function setAuth(cwd: string, options: { type?: AuthType; env?: string }): Promise<void> {
  ensureProject(cwd);
  const config = loadConfig(cwd);
  const envName = options.env || config.currentEnv;
  const env = loadEnvironment(envName, cwd);

  if (!env) {
    console.log(chalk.red(`环境 "${envName}" 不存在`));
    return;
  }

  let authType: AuthType = options.type || 'none';
  if (!options.type) {
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'type',
        message: '选择鉴权方式:',
        choices: [
          { name: '无', value: 'none' },
          { name: 'Bearer Token', value: 'bearer' },
          { name: 'Basic Auth', value: 'basic' },
          { name: 'API Key', value: 'api-key' },
          { name: 'OAuth2.0', value: 'oauth2' },
        ],
      },
    ]);
    authType = answer.type as AuthType;
  }

  const auth: AuthConfig = { type: authType };

  switch (authType) {
    case 'bearer': {
      const answer = await inquirer.prompt([
        { type: 'input', name: 'token', message: 'Token:' },
        { type: 'input', name: 'prefix', message: '前缀 (默认 Bearer):', default: 'Bearer' },
      ]);
      auth.bearer = { token: answer.token, prefix: answer.prefix };
      break;
    }
    case 'basic': {
      const answer = await inquirer.prompt([
        { type: 'input', name: 'username', message: '用户名:' },
        { type: 'password', name: 'password', message: '密码:' },
      ]);
      auth.basic = { username: answer.username, password: answer.password };
      break;
    }
    case 'api-key': {
      const answer = await inquirer.prompt([
        { type: 'input', name: 'key', message: 'Key 名称:' },
        { type: 'input', name: 'value', message: 'Key 值:' },
        {
          type: 'list',
          name: 'in',
          message: '位置:',
          choices: [
            { name: 'Header', value: 'header' },
            { name: 'Query', value: 'query' },
          ],
        },
      ]);
      auth.apiKey = { key: answer.key, value: answer.value, in: answer.in };
      break;
    }
  }

  env.auth = auth;
  saveEnvironment(env, cwd);
  console.log(chalk.green(`✅ 鉴权配置已更新 (${authType})`));
}

function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  if (value.length <= 10) return value.slice(0, 2) + '****' + value.slice(-2);
  return value.slice(0, 4) + '****' + value.slice(-4);
}
