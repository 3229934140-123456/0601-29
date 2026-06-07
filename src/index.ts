#!/usr/bin/env node

import { Command } from 'commander';
const chalk = require('chalk');
import { initProject } from './commands/init';
import {
  listEnvironments,
  useEnvironment,
  addEnvironment,
  removeEnvironment,
  showEnvironment,
  setVariable,
  unsetVariable,
  setAuth,
} from './commands/env';
import {
  sendEndpoint,
  sendInteractive,
  listEndpoints,
  toggleFavorite,
} from './commands/send';
import {
  runCollection,
  runFavorites,
  listRunsCommand,
  showRunDetail,
} from './commands/run';
import {
  diffEndpoints,
  diffRuns,
  checkChanges,
} from './commands/diff';
import {
  previewDoc,
  generateExample,
  exportDoc,
} from './commands/doc';
import {
  showHistory,
  showHistoryDetail,
  replayHistory,
  clearHistory,
} from './commands/history';
import { exportCollection } from './commands/export';

const program = new Command();

program
  .name('apim')
  .description('接口管理命令行工具 - 面向后端与测试人员的接口调试利器')
  .version('1.0.0', '-v, --version', '显示版本号');

// init 命令
program
  .command('init')
  .description('初始化 APIM 项目')
  .option('-n, --name <name>', '项目名称')
  .option('-f, --force', '强制覆盖已有配置')
  .action(async (options) => {
    try {
      await initProject(process.cwd(), options);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// env 命令组
const envCmd = program
  .command('env')
  .description('环境管理');

envCmd
  .command('list')
  .description('列出所有环境')
  .action(() => {
    try {
      listEnvironments(process.cwd());
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('use <name>')
  .description('切换当前环境')
  .action((name) => {
    try {
      useEnvironment(process.cwd(), name);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('add [name]')
  .description('添加新环境')
  .action(async (name) => {
    try {
      await addEnvironment(process.cwd(), name);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('remove <name>')
  .description('删除环境')
  .option('-f, --force', '强制删除，不确认')
  .action(async (name, options) => {
    try {
      await removeEnvironment(process.cwd(), name, options.force);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('show [name]')
  .description('显示环境详情')
  .action((name) => {
    try {
      showEnvironment(process.cwd(), name);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('set <key> <value>')
  .description('设置环境变量')
  .option('-e, --env <env>', '指定环境')
  .option('-s, --secret', '标记为敏感值')
  .option('-d, --desc <desc>', '变量描述')
  .action(async (key, value, options) => {
    try {
      await setVariable(process.cwd(), key, value, {
        env: options.env,
        secret: options.secret,
        desc: options.desc,
      });
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('unset <key>')
  .description('删除环境变量')
  .option('-e, --env <env>', '指定环境')
  .action(async (key, options) => {
    try {
      await unsetVariable(process.cwd(), key, { env: options.env });
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

envCmd
  .command('auth')
  .description('配置鉴权')
  .option('-t, --type <type>', '鉴权类型: none|bearer|basic|api-key|oauth2')
  .option('-e, --env <env>', '指定环境')
  .action(async (options) => {
    try {
      await setAuth(process.cwd(), { type: options.type, env: options.env });
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// send 命令
program
  .command('send [endpoint]')
  .description('发送接口请求')
  .option('-e, --env <env>', '指定环境')
  .option('-x, --example <name>', '使用指定示例')
  .option('-b, --body <json>', '请求体 (JSON)')
  .option('-q, --query <params>', '查询参数 (key=value&key2=value2)')
  .option('-H, --header <headers...>', '请求头 (Key: Value)')
  .option('-i, --show-headers', '显示请求头和响应头')
  .option('--no-mask', '不隐藏敏感值')
  .option('-q, --quiet', '安静模式，只显示简要结果')
  .action(async (endpoint, options) => {
    try {
      if (endpoint) {
        await sendEndpoint(process.cwd(), endpoint, options);
      } else {
        await sendInteractive(process.cwd(), options);
      }
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// list 命令
program
  .command('list')
  .description('列出所有接口')
  .option('-g, --group <groupId>', '按分组筛选')
  .option('-t, --tag <tag>', '按标签筛选')
  .option('-f, --favorite', '只显示收藏的接口')
  .option('-s, --search <keyword>', '搜索关键词')
  .action((options) => {
    try {
      listEndpoints(process.cwd(), options);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// fav 命令
program
  .command('fav <endpoint>')
  .description('收藏/取消收藏接口')
  .action((endpoint) => {
    try {
      toggleFavorite(process.cwd(), endpoint);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// run 命令
const runCmd = program
  .command('run')
  .description('批量运行接口');

runCmd
  .argument('[endpoints...]', '接口名称或ID列表')
  .option('-e, --env <env>', '指定环境')
  .option('-g, --group <groupId>', '按分组运行')
  .option('-t, --tag <tag>', '按标签运行')
  .option('-f, --favorite', '运行收藏的接口')
  .option('-a, --all', '运行所有接口')
  .option('--fail-fast', '遇到失败立即停止')
  .option('-p, --parallel', '并行执行')
  .option('-n, --name <name>', '运行名称')
  .option('--no-save', '不保存运行结果')
  .action(async (endpoints, options) => {
    try {
      if (options.favorite) {
        await runFavorites(process.cwd(), options);
      } else {
        await runCollection(process.cwd(), endpoints, options);
      }
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

runCmd
  .command('list')
  .description('查看运行记录')
  .option('-n, --limit <number>', '显示数量', '10')
  .action((options) => {
    try {
      listRunsCommand(process.cwd(), parseInt(options.limit, 10));
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

runCmd
  .command('show <id>')
  .description('查看运行详情')
  .action((id) => {
    try {
      showRunDetail(process.cwd(), id);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// diff 命令
const diffCmd = program
  .command('diff')
  .description('结果对比');

diffCmd
  .command('endpoint <endpoint>')
  .description('对比接口在不同环境的响应')
  .option('-e, --env <env>', '环境 A')
  .option('--env2 <env>', '环境 B (必填)')
  .option('--no-mask', '不隐藏敏感值')
  .action(async (endpoint, options) => {
    try {
      await diffEndpoints(process.cwd(), endpoint, options);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

diffCmd
  .command('runs <runId1> <runId2>')
  .description('对比两次运行结果')
  .option('--no-mask', '不隐藏敏感值')
  .action(async (runId1, runId2, options) => {
    try {
      await diffRuns(process.cwd(), runId1, runId2, options);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

diffCmd
  .command('check')
  .description('检查最近两次运行的变化')
  .action((options) => {
    try {
      checkChanges(process.cwd(), options);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// doc 命令
const docCmd = program
  .command('doc')
  .description('接口文档');

docCmd
  .command('preview [endpoint]')
  .description('预览接口文档')
  .option('-g, --group', '按分组查看')
  .action((endpoint, options) => {
    try {
      previewDoc(process.cwd(), endpoint, options);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

docCmd
  .command('example <endpoint>')
  .description('生成请求示例')
  .option('-n, --name <name>', '示例名称')
  .action((endpoint, options) => {
    try {
      generateExample(process.cwd(), endpoint, options.name);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

docCmd
  .command('export <output>')
  .description('导出接口文档')
  .option('-f, --format <format>', '格式: markdown|html', 'markdown')
  .action((output, options) => {
    try {
      exportDoc(process.cwd(), output, options.format);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// history 命令
const historyCmd = program
  .command('history')
  .description('历史记录');

historyCmd
  .command('list')
  .description('查看历史记录')
  .option('-n, --limit <number>', '显示数量', '20')
  .action((options) => {
    try {
      showHistory(process.cwd(), { limit: parseInt(options.limit, 10) });
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

historyCmd
  .command('show <index>')
  .description('查看历史详情')
  .option('-b, --body', '显示请求体')
  .option('--no-mask', '不隐藏敏感值')
  .action((index, options) => {
    try {
      showHistoryDetail(process.cwd(), parseInt(index, 10), {
        showBody: options.body,
        noMask: !options.mask,
      });
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

historyCmd
  .command('replay <index>')
  .description('重放历史请求')
  .option('-e, --env <env>', '指定环境')
  .action(async (index, options) => {
    try {
      await replayHistory(process.cwd(), parseInt(index, 10), { env: options.env });
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

historyCmd
  .command('clear')
  .description('清空历史记录')
  .option('-f, --force', '强制清空')
  .action((options) => {
    try {
      clearHistory(process.cwd(), options.force);
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// export 命令
const exportCmd = program
  .command('export')
  .description('导出集合');

exportCmd
  .command('collection')
  .description('导出接口集合')
  .option('-f, --format <format>', '格式: json|yaml|postman|curl', 'json')
  .option('-o, --output <path>', '输出文件路径')
  .option('--include-secrets', '包含敏感值')
  .action((options) => {
    try {
      exportCollection(process.cwd(), {
        format: options.format,
        output: options.output,
        includeSecrets: options.includeSecrets,
      });
    } catch (error: any) {
      console.error(chalk.red('错误:'), error.message);
      process.exit(1);
    }
  });

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n未处理的错误:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  console.error(chalk.red('\n未处理的拒绝:'), reason?.message || reason);
  process.exit(1);
});

program.parse(process.argv);

// 如果没有输入任何命令，显示帮助
if (process.argv.length === 2) {
  program.outputHelp();
}
