const chalk = require('chalk');
import * as inquirer from 'inquirer';
import { ApiGroup, ApiEndpoint, HttpMethod, Parameter, Assertion } from '../types';
import {
  ensureProject,
  loadGroups,
  saveGroups,
  saveEndpoint,
  generateId,
} from '../core/config';

const Table = require('cli-table3');

export async function addGroup(cwd: string, name?: string): Promise<void> {
  ensureProject(cwd);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '分组名称:',
      default: name,
      when: !name,
      validate: function(input: string) {
        if (!input || input.trim() === '') return '分组名称不能为空';
        return true;
      }
    },
    {
      type: 'input',
      name: 'description',
      message: '分组描述 (可选):',
      default: '',
    },
  ]);

  const groupName = name || answers.name;
  const groups = loadGroups(cwd);

  if (groups.find(function(g) { return g.name === groupName; })) {
    console.log(chalk.red('分组 "' + groupName + '" 已存在'));
    return;
  }

  const group: ApiGroup = {
    id: generateId(),
    name: groupName,
    description: answers.description || undefined,
    endpoints: [],
  };

  groups.push(group);
  saveGroups(groups, cwd);

  console.log(chalk.green('✅ 分组 "' + groupName + '" 已创建'));
  console.log(chalk.gray('   ID: ' + group.id));
}

export async function addEndpoint(cwd: string, name?: string): Promise<void> {
  ensureProject(cwd);

  const groups = loadGroups(cwd);

  const methodChoices = [
    { name: 'GET', value: 'GET' },
    { name: 'POST', value: 'POST' },
    { name: 'PUT', value: 'PUT' },
    { name: 'DELETE', value: 'DELETE' },
    { name: 'PATCH', value: 'PATCH' },
  ];

  const groupChoices = groups.map(function(g) {
    return { name: g.name, value: g.id };
  });
  groupChoices.unshift({ name: '不分组', value: '' });

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: '接口名称:',
      default: name,
      when: !name,
      validate: function(input: string) {
        if (!input || input.trim() === '') return '接口名称不能为空';
        return true;
      }
    },
    {
      type: 'input',
      name: 'description',
      message: '接口描述 (可选):',
      default: '',
    },
    {
      type: 'list',
      name: 'method',
      message: '请求方法:',
      choices: methodChoices,
      default: 'GET',
    },
    {
      type: 'input',
      name: 'path',
      message: '请求路径:',
      default: '/api/endpoint',
      validate: function(input: string) {
        if (!input || input.trim() === '') return '路径不能为空';
        return true;
      }
    },
    {
      type: 'list',
      name: 'groupId',
      message: '所属分组:',
      choices: groupChoices,
      default: '',
    },
    {
      type: 'input',
      name: 'tags',
      message: '标签 (用逗号分隔，可选):',
      default: '',
    },
    {
      type: 'confirm',
      name: 'addHeaders',
      message: '是否添加请求头?',
      default: false,
    },
  ]);

  const endpoint: ApiEndpoint = {
    id: generateId(),
    name: answers.name,
    description: answers.description || undefined,
    method: answers.method as HttpMethod,
    path: answers.path,
    groupId: answers.groupId || undefined,
    tags: answers.tags ? answers.tags.split(',').map(function(t: string) { return t.trim(); }).filter(Boolean) : undefined,
    headers: {},
    assertions: [],
    examples: [],
    favorite: false,
  };

  if (answers.addHeaders) {
    const headerAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'headers',
        message: '请求头 (格式: Key1:Value1, Key2:Value2):',
        default: '',
      },
    ]);

    if (headerAnswers.headers && headerAnswers.headers.trim() !== '') {
      const headers: Record<string, string> = {};
      headerAnswers.headers.split(',').forEach(function(h: string) {
        const colonIndex = h.indexOf(':');
        if (colonIndex > 0) {
          const key = h.slice(0, colonIndex).trim();
          const val = h.slice(colonIndex + 1).trim();
          if (key) headers[key] = val;
        }
      });
      endpoint.headers = headers;
    }
  }

  const paramAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addParams',
      message: '是否添加查询参数?',
      default: false,
    },
  ]);

  if (paramAnswer.addParams) {
    const paramStrAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'params',
        message: '查询参数 (格式: name1:desc1, name2:desc2):',
        default: '',
      },
    ]);

    if (paramStrAnswer.params && paramStrAnswer.params.trim() !== '') {
      const params: Parameter[] = [];
      paramStrAnswer.params.split(',').forEach(function(p: string) {
        const parts = p.split(':');
        const name = parts[0].trim();
        const desc = parts.slice(1).join(':').trim();
        if (name) {
          params.push({
            name: name,
            in: 'query',
            required: false,
            description: desc || undefined,
          });
        }
      });
      endpoint.parameters = params;
    }
  }

  const bodyAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addBody',
      message: '是否添加请求体示例?',
      default: answers.method === 'POST' || answers.method === 'PUT',
    },
  ]);

  if (bodyAnswer.addBody) {
    const bodyStrAnswer = await inquirer.prompt([
      {
        type: 'editor',
        name: 'body',
        message: '请求体 JSON 示例:',
        default: '{\n  "key": "value"\n}',
      },
    ]);

    try {
      const bodyJson = JSON.parse(bodyStrAnswer.body);
      endpoint.requestBody = {
        contentType: 'application/json',
        examples: {
          default: bodyJson,
        },
      };

      const exampleNameAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'exampleName',
          message: '示例名称:',
          default: '默认示例',
        },
      ]);

      endpoint.examples = [{
        id: generateId(),
        name: exampleNameAnswer.exampleName,
        description: '默认请求示例',
        body: bodyJson,
      }];
    } catch (e) {
      console.log(chalk.yellow('请求体不是有效的 JSON，已跳过'));
    }
  }

  const assertAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'addAssertions',
      message: '是否添加断言?',
      default: true,
    },
  ]);

  if (assertAnswer.addAssertions) {
    const assertions: Assertion[] = [];

    const statusAssert = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addStatus',
        message: '添加状态码断言?',
        default: true,
      },
    ]);

    if (statusAssert.addStatus) {
      const statusAns = await inquirer.prompt([
        {
          type: 'input',
          name: 'statusCode',
          message: '期望状态码:',
          default: '200',
        },
      ]);

      assertions.push({
        id: generateId(),
        name: '状态码' + statusAns.statusCode,
        type: 'status',
        operator: 'eq',
        value: parseInt(statusAns.statusCode, 10) || 200,
        enabled: true,
      });
    }

    const timeAssert = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addTime',
        message: '添加响应时间断言?',
        default: true,
      },
    ]);

    if (timeAssert.addTime) {
      const timeAns = await inquirer.prompt([
        {
          type: 'input',
          name: 'maxTime',
          message: '最大响应时间 (毫秒):',
          default: '3000',
        },
      ]);

      assertions.push({
        id: generateId(),
        name: '响应时间小于' + timeAns.maxTime + 'ms',
        type: 'time',
        operator: 'lt',
        value: parseInt(timeAns.maxTime, 10) || 3000,
        enabled: true,
      });
    }

    if (assertions.length > 0) {
      endpoint.assertions = assertions;
    }
  }

  const favAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'favorite',
      message: '设为收藏接口?',
      default: false,
    },
  ]);
  endpoint.favorite = favAnswer.favorite;

  saveEndpoint(endpoint, cwd);

  console.log(chalk.green('\n✅ 接口 "' + endpoint.name + '" 已创建'));
  console.log(chalk.gray('   ID: ' + endpoint.id));
  console.log(chalk.gray('   方法: ' + endpoint.method));
  console.log(chalk.gray('   路径: ' + endpoint.path));
  if (endpoint.groupId) {
    const group = groups.find(function(g) { return g.id === endpoint.groupId; });
    console.log(chalk.gray('   分组: ' + (group ? group.name : endpoint.groupId)));
  }
}
