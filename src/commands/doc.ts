import * as fs from 'fs';
import * as path from 'path';
const chalk = require('chalk');
const Table = require('cli-table3');
import { ApiEndpoint, ApiGroup, Example, Parameter, RequestBody } from '../types';
import {
  ensureProject,
  loadConfig,
  loadEndpoints,
  loadGroups,
  findEndpointByNameOrId,
  saveEndpoint,
  generateId,
} from '../core/config';

interface DocOptions {
  group?: boolean;
  output?: string;
  format?: 'markdown' | 'html' | 'text';
}

export function previewDoc(cwd: string, query?: string, options?: DocOptions): void {
  ensureProject(cwd);
  const config = loadConfig(cwd);

  if (query) {
    const endpoint = findEndpointByNameOrId(query, cwd);
    if (!endpoint) {
      console.log(chalk.red(`未找到接口: ${query}`));
      return;
    }
    printEndpointDoc(endpoint);
  } else if (options?.group) {
    printGroupsDoc(cwd);
  } else {
    printAllEndpointsDoc(cwd);
  }
}

function printAllEndpointsDoc(cwd: string): void {
  const endpoints = loadEndpoints(cwd);
  const groups = loadGroups(cwd);

  console.log(chalk.cyan('\n📚 API 文档\n'));
  console.log(chalk.gray(`共 ${endpoints.length} 个接口，${groups.length} 个分组\n`));

  const groupMap = new Map<string, ApiGroup>();
  for (const g of groups) {
    groupMap.set(g.id, g);
  }

  const grouped = new Map<string | null, ApiEndpoint[]>();
  for (const ep of endpoints) {
    const key = ep.groupId || null;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ep);
  }

  for (const [groupId, eps] of grouped) {
    const group = groupId ? groupMap.get(groupId) : null;
    if (group) {
      console.log(chalk.bold.cyan(`📁 ${group.name}`));
      if (group.description) {
        console.log(chalk.gray(`   ${group.description}`));
      }
    } else {
      console.log(chalk.bold.gray('📁 未分组'));
    }

    const table = new Table({
      head: [chalk.cyan('方法'), chalk.cyan('名称'), chalk.cyan('路径'), chalk.cyan('描述')],
      colWidths: [8, 25, 35, 30],
      wordWrap: true,
    });

    for (const ep of eps) {
      table.push([
        getMethodColor(ep.method)(ep.method),
        ep.name,
        chalk.gray(ep.path),
        ep.description || '',
      ]);
    }

    console.log(table.toString());
    console.log('');
  }
}

function printGroupsDoc(cwd: string): void {
  const groups = loadGroups(cwd);

  if (groups.length === 0) {
    console.log(chalk.yellow('暂无分组'));
    return;
  }

  console.log(chalk.cyan('\n📁 接口分组\n'));

  const table = new Table({
    head: [chalk.cyan('分组'), chalk.cyan('描述'), chalk.cyan('接口数')],
    colWidths: [25, 40, 10],
  });

  for (const g of groups) {
    table.push([g.name, g.description || '', g.endpoints?.length || 0]);
  }

  console.log(table.toString());
  console.log('');
}

function printEndpointDoc(endpoint: ApiEndpoint): void {
  console.log('');
  console.log(chalk.bold.cyan(`📋 ${endpoint.name}`));
  console.log(chalk.gray(`   ${endpoint.description || '暂无描述'}`));
  console.log('');

  console.log(`${getMethodColor(endpoint.method)(endpoint.method.padEnd(7))} ${chalk.white(endpoint.path)}`);
  console.log('');

  if (endpoint.tags && endpoint.tags.length > 0) {
    console.log(chalk.gray(`标签: ${endpoint.tags.map(t => '#' + t).join(' ')}\n`));
  }

  if (endpoint.parameters && endpoint.parameters.length > 0) {
    console.log(chalk.cyan('📝 参数:'));
    const table = new Table({
      head: [chalk.cyan('位置'), chalk.cyan('名称'), chalk.cyan('必填'), chalk.cyan('描述'), chalk.cyan('示例')],
      colWidths: [10, 20, 8, 30, 20],
    });

    for (const param of endpoint.parameters) {
      table.push([
        param.in,
        param.name,
        param.required ? chalk.green('是') : chalk.gray('否'),
        param.description || '',
        param.example !== undefined ? String(param.example) : '',
      ]);
    }
    console.log(table.toString());
    console.log('');
  }

  if (endpoint.requestBody) {
    console.log(chalk.cyan('📦 请求体:'));
    console.log(chalk.gray(`  Content-Type: ${endpoint.requestBody.contentType}`));
    if (endpoint.requestBody.examples) {
      const defaultExample = endpoint.requestBody.examples['default'] || Object.values(endpoint.requestBody.examples)[0];
      console.log('');
      console.log(JSON.stringify(defaultExample, null, 2));
    }
    console.log('');
  }

  if (endpoint.assertions && endpoint.assertions.length > 0) {
    console.log(chalk.cyan('✅ 断言:'));
    const table = new Table({
      head: [chalk.cyan('名称'), chalk.cyan('类型'), chalk.cyan('操作符'), chalk.cyan('值'), chalk.cyan('状态')],
      colWidths: [20, 12, 12, 20, 8],
    });

    for (const a of endpoint.assertions) {
      table.push([
        a.name,
        a.type,
        a.operator,
        String(a.value),
        a.enabled !== false ? chalk.green('启用') : chalk.gray('禁用'),
      ]);
    }
    console.log(table.toString());
    console.log('');
  }

  if (endpoint.examples && endpoint.examples.length > 0) {
    console.log(chalk.cyan('💡 示例:'));
    for (const ex of endpoint.examples) {
      console.log(`  - ${chalk.yellow(ex.name)}${ex.description ? ': ' + ex.description : ''}`);
    }
    console.log('');
  }

  if (endpoint.auth && endpoint.auth.type !== 'none') {
    console.log(chalk.cyan('🔐 鉴权:'));
    console.log(`  类型: ${endpoint.auth.type}`);
    console.log('');
  }
}

export function generateExample(cwd: string, query: string, name?: string): void {
  ensureProject(cwd);
  const endpoint = findEndpointByNameOrId(query, cwd);

  if (!endpoint) {
    console.log(chalk.red(`未找到接口: ${query}`));
    return;
  }

  const example: Example = {
    id: generateId(),
    name: name || `示例 ${(endpoint.examples?.length || 0) + 1}`,
    description: '自动生成的示例',
  };

  if (endpoint.parameters) {
    const pathParams = endpoint.parameters.filter(p => p.in === 'path');
    const queryParams = endpoint.parameters.filter(p => p.in === 'query');
    const headerParams = endpoint.parameters.filter(p => p.in === 'header');

    if (pathParams.length > 0) {
      example.pathParams = {};
      for (const p of pathParams) {
        example.pathParams[p.name] = p.example !== undefined ? String(p.example) : `{{${p.name}}}`;
      }
    }
    if (queryParams.length > 0) {
      example.queryParams = {};
      for (const p of queryParams) {
        example.queryParams[p.name] = p.example !== undefined ? String(p.example) : '';
      }
    }
    if (headerParams.length > 0) {
      example.headers = {};
      for (const p of headerParams) {
        example.headers[p.name] = p.example !== undefined ? String(p.example) : '';
      }
    }
  }

  if (endpoint.requestBody?.examples) {
    const defaultExample = endpoint.requestBody.examples['default'] || Object.values(endpoint.requestBody.examples)[0];
    example.body = JSON.parse(JSON.stringify(defaultExample));
  }

  if (!endpoint.examples) {
    endpoint.examples = [];
  }
  endpoint.examples.push(example);
  saveEndpoint(endpoint, cwd);

  console.log(chalk.green(`✅ 已生成示例 "${example.name}"`));
  console.log(JSON.stringify(example, null, 2));
}

export function exportDoc(cwd: string, output: string, format: string = 'markdown'): void {
  ensureProject(cwd);
  const config = loadConfig(cwd);
  const endpoints = loadEndpoints(cwd);
  const groups = loadGroups(cwd);

  let content = '';

  if (format === 'markdown') {
    content = generateMarkdownDoc(config.name, config.description, endpoints, groups);
  } else if (format === 'html') {
    content = generateHtmlDoc(config.name, config.description, endpoints, groups);
  } else {
    console.log(chalk.red(`不支持的格式: ${format}`));
    return;
  }

  const outputPath = path.resolve(cwd, output);
  fs.writeFileSync(outputPath, content, 'utf-8');
  console.log(chalk.green(`✅ 文档已导出到: ${outputPath}`));
}

function generateMarkdownDoc(
  name: string,
  description: string | undefined,
  endpoints: ApiEndpoint[],
  groups: ApiGroup[]
): string {
  let md = `# ${name}\n\n`;
  if (description) {
    md += `${description}\n\n`;
  }
  md += `共 ${endpoints.length} 个接口\n\n`;
  md += `## 目录\n\n`;

  const groupMap = new Map(groups.map(g => [g.id, g]));
  const grouped = new Map<string | null, ApiEndpoint[]>();

  for (const ep of endpoints) {
    const key = ep.groupId || null;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(ep);
  }

  for (const [groupId, eps] of grouped) {
    const group = groupId ? groupMap.get(groupId) : null;
    const groupName = group?.name || '未分组';
    md += `- **${groupName}**\n`;
    for (const ep of eps) {
      const anchor = ep.name.toLowerCase().replace(/\s+/g, '-');
      md += `  - [${ep.method} ${ep.name}](#${anchor})\n`;
    }
  }
  md += '\n';

  for (const [groupId, eps] of grouped) {
    const group = groupId ? groupMap.get(groupId) : null;
    const groupName = group?.name || '未分组';
    md += `## ${groupName}\n\n`;
    if (group?.description) {
      md += `${group.description}\n\n`;
    }

    for (const ep of eps) {
      md += `### ${ep.method} ${ep.name}\n\n`;
      md += `\`${ep.method} ${ep.path}\`\n\n`;
      if (ep.description) {
        md += `${ep.description}\n\n`;
      }

      if (ep.parameters && ep.parameters.length > 0) {
        md += `**参数**\n\n`;
        md += `| 位置 | 名称 | 必填 | 描述 | 示例 |\n`;
        md += `| --- | --- | --- | --- | --- |\n`;
        for (const p of ep.parameters) {
          md += `| ${p.in} | ${p.name} | ${p.required ? '是' : '否'} | ${p.description || ''} | ${p.example !== undefined ? p.example : ''} |\n`;
        }
        md += '\n';
      }

      if (ep.requestBody?.examples) {
        md += `**请求体示例**\n\n`;
        md += '```json\n';
        const defaultExample = ep.requestBody.examples['default'] || Object.values(ep.requestBody.examples)[0];
        md += JSON.stringify(defaultExample, null, 2) + '\n';
        md += '```\n\n';
      }
    }
  }

  return md;
}

function generateHtmlDoc(
  name: string,
  description: string | undefined,
  endpoints: ApiEndpoint[],
  groups: ApiGroup[]
): string {
  const md = generateMarkdownDoc(name, description, endpoints, groups);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name} - API 文档</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 960px; margin: 0 auto; padding: 20px; line-height: 1.6; color: #333; }
    h1, h2, h3 { color: #2c3e50; }
    h1 { border-bottom: 3px solid #3498db; padding-bottom: 10px; }
    h2 { border-bottom: 2px solid #eee; padding-bottom: 8px; margin-top: 30px; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; }
    pre { background: #282c34; color: #abb2bf; padding: 15px; border-radius: 5px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f8f9fa; }
    tr:nth-child(even) { background: #f9f9f9; }
  </style>
</head>
<body>
${markdownToSimpleHtml(md)}
</body>
</html>`;
}

function markdownToSimpleHtml(md: string): string {
  let html = md;
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`{3}(\w+)?\n([\s\S]*?)`{3}/g, '<pre><code>$2</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>\n$&</ul>\n');
  html = html.replace(/\|(.+)\|/g, (match) => {
    const cells = match.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
    return `<tr>${cells}</tr>`;
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>\n$&</table>\n');
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  return html;
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
