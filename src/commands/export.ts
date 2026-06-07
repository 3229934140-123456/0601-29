import * as fs from 'fs';
import * as path from 'path';
const chalk = require('chalk');
import * as yaml from 'js-yaml';
import { ApiEndpoint, Environment, ExportFormat, ApiConfig } from '../types';
import {
  ensureProject,
  loadConfig,
  loadEndpoints,
  loadEnvironments,
  loadGroups,
} from '../core/config';

interface ExportOptions {
  format?: ExportFormat;
  output?: string;
  env?: string;
  includeSecrets?: boolean;
}

export function exportCollection(cwd: string, options: ExportOptions): void {
  ensureProject(cwd);
  const config = loadConfig(cwd);
  const format = options.format || 'json';
  const output = options.output || `collection.${format === 'yaml' ? 'yaml' : format === 'postman' ? 'json' : format === 'curl' ? 'sh' : 'json'}`;

  let content: string;

  switch (format) {
    case 'json':
      content = exportJson(cwd, options);
      break;
    case 'yaml':
      content = exportYaml(cwd, options);
      break;
    case 'postman':
      content = exportPostman(cwd, config, options);
      break;
    case 'curl':
      content = exportCurl(cwd, options);
      break;
    default:
      console.log(chalk.red(`不支持的导出格式: ${format}`));
      return;
  }

  const outputPath = path.resolve(cwd, output);
  fs.writeFileSync(outputPath, content, 'utf-8');

  const size = fs.statSync(outputPath).size;
  console.log(chalk.green(`✅ 集合已导出到: ${outputPath}`));
  console.log(chalk.gray(`   格式: ${format} | 大小: ${formatSize(size)}`));
}

function exportJson(cwd: string, options: ExportOptions): string {
  const endpoints = loadEndpoints(cwd);
  const environments = loadEnvironments(cwd);
  const groups = loadGroups(cwd);
  const config = loadConfig(cwd);

  const data = {
    config: {
      name: config.name,
      version: config.version,
      description: config.description,
    },
    environments: environments.map(e => ({
      name: e.name,
      baseUrl: e.baseUrl,
      variables: filterSecrets(e.variables, options.includeSecrets),
    })),
    groups,
    endpoints,
  };

  return JSON.stringify(data, null, 2);
}

function exportYaml(cwd: string, options: ExportOptions): string {
  const jsonStr = exportJson(cwd, options);
  const data = JSON.parse(jsonStr);
  return yaml.dump(data, { indent: 2 });
}

function exportPostman(cwd: string, config: ApiConfig, options: ExportOptions): string {
  const endpoints = loadEndpoints(cwd);
  const groups = loadGroups(cwd);

  const groupMap = new Map(groups.map(g => [g.id, g]));
  const grouped = new Map<string | null, ApiEndpoint[]>();

  for (const ep of endpoints) {
    const key = ep.groupId || null;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ep);
  }

  const collection: any = {
    info: {
      name: config.name,
      description: config.description || '',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: [],
  };

  for (const [groupId, eps] of grouped) {
    const group = groupId ? groupMap.get(groupId) : null;
    const folder: any = {
      name: group?.name || '未分组',
      item: eps.map(ep => endpointToPostman(ep)),
    };
    collection.item.push(folder);
  }

  return JSON.stringify(collection, null, 2);
}

function endpointToPostman(endpoint: ApiEndpoint): any {
  const item: any = {
    name: endpoint.name,
    request: {
      method: endpoint.method,
      header: [],
      url: {
        raw: '{{baseUrl}}' + endpoint.path,
        host: ['{{baseUrl}}'],
        path: endpoint.path.split('/').filter(Boolean),
      },
    },
  };

  if (endpoint.description) {
    item.request.description = endpoint.description;
  }

  if (endpoint.headers) {
    for (const [key, value] of Object.entries(endpoint.headers)) {
      item.request.header.push({ key, value, type: 'text' });
    }
  }

  if (endpoint.parameters) {
    const queryParams = endpoint.parameters.filter(p => p.in === 'query');
    if (queryParams.length > 0) {
      item.request.url.query = queryParams.map(p => ({
        key: p.name,
        value: p.example || '',
        description: p.description || '',
      }));
    }

    const pathParams = endpoint.parameters.filter(p => p.in === 'path');
    if (pathParams.length > 0) {
      item.request.url.variable = pathParams.map(p => ({
        key: p.name,
        value: p.example || '',
        description: p.description || '',
      }));
    }
  }

  if (endpoint.requestBody?.examples) {
    const defaultExample = endpoint.requestBody.examples['default'] || Object.values(endpoint.requestBody.examples)[0];
    item.request.body = {
      mode: 'raw',
      raw: JSON.stringify(defaultExample, null, 2),
      options: {
        raw: {
          language: 'json',
        },
      },
    };
  }

  return item;
}

function exportCurl(cwd: string, options: ExportOptions): string {
  const endpoints = loadEndpoints(cwd);
  const config = loadConfig(cwd);

  let script = '#!/bin/bash\n';
  script += `# ${config.name} API Collection\n`;
  script += `# 导出时间: ${new Date().toLocaleString()}\n\n`;

  script += 'BASE_URL="${BASE_URL:-http://localhost:8080}"\n\n';

  for (const endpoint of endpoints) {
    const safeName = endpoint.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    script += `# ${endpoint.name}\n`;
    script += `# ${endpoint.method} ${endpoint.path}\n`;
    if (endpoint.description) {
      script += `# ${endpoint.description}\n`;
    }

    let curlCmd = `curl -X ${endpoint.method} \\\n`;
    curlCmd += `  "$BASE_URL${endpoint.path}" \\\n`;

    if (endpoint.headers) {
      for (const [key, value] of Object.entries(endpoint.headers)) {
        curlCmd += `  -H "${key}: ${value}" \\\n`;
      }
    }

    if (endpoint.requestBody?.examples) {
      const defaultExample = endpoint.requestBody.examples['default'] || Object.values(endpoint.requestBody.examples)[0];
      curlCmd += `  -H "Content-Type: application/json" \\\n`;
      curlCmd += `  -d '${JSON.stringify(defaultExample)}' \\\n`;
    }

    curlCmd += '  -s -w "\\nHTTP Status: %{http_code}\\nTime: %{time_total}s\\n"\n';
    script += `function ${safeName}() {\n  ${curlCmd.replace(/\n/g, '\n  ')}\n}\n\n`;
  }

  script += '# 列出所有可用接口\n';
  script += 'function list_apis() {\n';
  script += '  echo "可用接口:"\n';
  for (const endpoint of endpoints) {
    const safeName = endpoint.name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    script += `  echo "  ${safeName} - ${endpoint.name}"\n`;
  }
  script += '}\n';

  return script;
}

function filterSecrets(variables: Record<string, any>, includeSecrets?: boolean): Record<string, any> {
  if (includeSecrets) return variables;

  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(variables)) {
    if (val?.secret) {
      result[key] = { ...val, value: '******' };
    } else {
      result[key] = val;
    }
  }
  return result;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
