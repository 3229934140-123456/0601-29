import * as fs from 'fs';
import * as path from 'path';
const chalk = require('chalk');
import * as inquirer from 'inquirer';
import { ApiConfig, Environment, ApiEndpoint, ApiGroup } from '../types';
import { getConfigDir, saveConfig, saveEnvironment, saveEndpoint, saveGroups, isProjectInitialized, generateId } from '../core/config';

interface InitOptions {
  force?: boolean;
  name?: string;
}

export async function initProject(cwd: string, options: InitOptions): Promise<void> {
  if (isProjectInitialized(cwd) && !options.force) {
    console.log(chalk.yellow('当前目录已存在 APIM 项目，使用 --force 覆盖'));
    return;
  }

  console.log(chalk.cyan('🚀 初始化 APIM 接口管理项目\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '项目名称:',
      default: options.name || path.basename(cwd) || 'my-api-project',
    },
    {
      type: 'input',
      name: 'description',
      message: '项目描述:',
      default: 'API 接口管理项目',
    },
    {
      type: 'input',
      name: 'baseUrl',
      message: '默认 API 地址:',
      default: 'http://localhost:8080',
    },
    {
      type: 'input',
      name: 'envName',
      message: '初始环境名称:',
      default: 'dev',
    },
    {
      type: 'confirm',
      name: 'addExamples',
      message: '是否添加示例接口?',
      default: true,
    },
  ]);

  const configDir = getConfigDir(cwd);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const config: ApiConfig = {
    name: answers.name,
    version: '1.0.0',
    description: answers.description,
    currentEnv: answers.envName,
    sensitiveKeys: [],
    auth: { type: 'none' },
  };

  saveConfig(config, cwd);

  const env: Environment = {
    name: answers.envName,
    baseUrl: answers.baseUrl,
    variables: {
      apiKey: { value: 'your-api-key-here', secret: true, description: 'API 访问密钥' },
      userId: { value: '10001', description: '默认用户ID' },
    },
    auth: { type: 'none' },
  };
  saveEnvironment(env, cwd);

  saveGroups([], cwd);

  if (answers.addExamples) {
    addExampleEndpoints(cwd);
  }

  console.log('\n' + chalk.green('✅ 项目初始化成功!'));
  console.log(chalk.gray(`   配置目录: ${configDir}`));
  console.log('');
  console.log(chalk.cyan('   常用命令:'));
  console.log('     apim env list           查看环境列表');
  console.log('     apim env use <name>     切换环境');
  console.log('     apim send <name>        发送请求');
  console.log('     apim run                批量运行接口');
  console.log('     apim doc                预览接口文档');
  console.log('     apim history            查看历史记录');
}

function addExampleEndpoints(cwd: string): void {
  const groupId = generateId();

  const groups: ApiGroup[] = [
    {
      id: groupId,
      name: '用户管理',
      description: '用户相关接口',
      endpoints: [],
    },
  ];
  saveGroups(groups, cwd);

  const endpoints: ApiEndpoint[] = [
    {
      id: generateId(),
      name: '获取用户列表',
      description: '分页获取用户列表',
      method: 'GET',
      path: '/api/users',
      groupId: groupId,
      tags: ['用户', '列表'],
      parameters: [
        { name: 'page', in: 'query', required: false, description: '页码', example: 1 },
        { name: 'pageSize', in: 'query', required: false, description: '每页数量', example: 10 },
      ],
      headers: {},
      assertions: [
        { id: generateId(), name: '状态码200', type: 'status', operator: 'eq', value: 200, enabled: true },
        { id: generateId(), name: '响应时间小于3秒', type: 'time', operator: 'lt', value: 3000, enabled: true },
      ],
      examples: [
        {
          id: generateId(),
          name: '第一页',
          queryParams: { page: '1', pageSize: '10' },
        },
      ],
      favorite: true,
    },
    {
      id: generateId(),
      name: '获取用户详情',
      description: '根据ID获取用户详情',
      method: 'GET',
      path: '/api/users/{{userId}}',
      groupId: groupId,
      tags: ['用户', '详情'],
      parameters: [
        { name: 'userId', in: 'path', required: true, description: '用户ID', example: 10001 },
      ],
      assertions: [
        { id: generateId(), name: '状态码200', type: 'status', operator: 'eq', value: 200, enabled: true },
        { id: generateId(), name: '返回用户ID', type: 'json-path', operator: 'exists', value: true, path: 'data.id', enabled: true },
      ],
      examples: [
        {
          id: generateId(),
          name: '默认用户',
          pathParams: { userId: '{{userId}}' },
        },
      ],
    },
    {
      id: generateId(),
      name: '创建用户',
      description: '创建新用户',
      method: 'POST',
      path: '/api/users',
      groupId: groupId,
      tags: ['用户', '创建'],
      requestBody: {
        contentType: 'application/json',
        examples: {
          default: {
            name: '张三',
            email: 'zhangsan@example.com',
            password: '123456',
          },
        },
      },
      assertions: [
        { id: generateId(), name: '状态码201', type: 'status', operator: 'eq', value: 201, enabled: true },
        { id: generateId(), name: '包含用户ID', type: 'json-path', operator: 'exists', value: true, path: 'id', enabled: false },
      ],
      examples: [
        {
          id: generateId(),
          name: '普通用户',
          body: { name: '李四', email: 'lisi@example.com', password: 'abc123' },
        },
      ],
    },
  ];

  for (const endpoint of endpoints) {
    saveEndpoint(endpoint, cwd);
  }
}
