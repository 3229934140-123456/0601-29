import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import {
  ApiConfig,
  Environment,
  ApiGroup,
  ApiEndpoint,
  HistoryEntry,
  RunResult,
  RequestResult,
} from '../types';

const CONFIG_DIR = '.apim';
const CONFIG_FILE = 'config.yaml';
const ENV_DIR = 'environments';
const GROUPS_FILE = 'groups.yaml';
const ENDPOINTS_DIR = 'endpoints';
const HISTORY_FILE = 'history.json';
const RUNS_DIR = 'runs';

export function getConfigDir(cwd: string = process.cwd()): string {
  return path.join(cwd, CONFIG_DIR);
}

export function isProjectInitialized(cwd: string = process.cwd()): boolean {
  return fs.existsSync(path.join(getConfigDir(cwd), CONFIG_FILE));
}

export function ensureProject(cwd: string = process.cwd()): void {
  if (!isProjectInitialized(cwd)) {
    throw new Error('未找到 APIM 项目配置，请先运行 "apim init" 初始化项目');
  }
}

export function loadConfig(cwd: string = process.cwd()): ApiConfig {
  const configPath = path.join(getConfigDir(cwd), CONFIG_FILE);
  if (!fs.existsSync(configPath)) {
    throw new Error('配置文件不存在');
  }
  const content = fs.readFileSync(configPath, 'utf-8');
  return yaml.load(content) as ApiConfig;
}

export function saveConfig(config: ApiConfig, cwd: string = process.cwd()): void {
  const configPath = path.join(getConfigDir(cwd), CONFIG_FILE);
  const content = yaml.dump(config, { indent: 2 });
  fs.writeFileSync(configPath, content, 'utf-8');
}

export function loadEnvironments(cwd: string = process.cwd()): Environment[] {
  const envDir = path.join(getConfigDir(cwd), ENV_DIR);
  if (!fs.existsSync(envDir)) {
    return [];
  }
  const environments: Environment[] = [];
  const files = fs.readdirSync(envDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(envDir, file), 'utf-8');
    environments.push(yaml.load(content) as Environment);
  }
  return environments;
}

export function loadEnvironment(name: string, cwd: string = process.cwd()): Environment | null {
  const envPath = path.join(getConfigDir(cwd), ENV_DIR, `${name}.yaml`);
  if (!fs.existsSync(envPath)) {
    return null;
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  return yaml.load(content) as Environment;
}

export function saveEnvironment(env: Environment, cwd: string = process.cwd()): void {
  const envDir = path.join(getConfigDir(cwd), ENV_DIR);
  if (!fs.existsSync(envDir)) {
    fs.mkdirSync(envDir, { recursive: true });
  }
  const envPath = path.join(envDir, `${env.name}.yaml`);
  const content = yaml.dump(env, { indent: 2 });
  fs.writeFileSync(envPath, content, 'utf-8');
}

export function deleteEnvironment(name: string, cwd: string = process.cwd()): boolean {
  const envPath = path.join(getConfigDir(cwd), ENV_DIR, `${name}.yaml`);
  if (fs.existsSync(envPath)) {
    fs.unlinkSync(envPath);
    return true;
  }
  return false;
}

export function loadGroups(cwd: string = process.cwd()): ApiGroup[] {
  const groupsPath = path.join(getConfigDir(cwd), GROUPS_FILE);
  if (!fs.existsSync(groupsPath)) {
    return [];
  }
  const content = fs.readFileSync(groupsPath, 'utf-8');
  const data = yaml.load(content) as any;
  if (Array.isArray(data)) {
    return data;
  }
  if (data && Array.isArray(data.groups)) {
    return data.groups;
  }
  return [];
}

export function saveGroups(groups: ApiGroup[], cwd: string = process.cwd()): void {
  const groupsPath = path.join(getConfigDir(cwd), GROUPS_FILE);
  const content = yaml.dump(groups, { indent: 2 });
  fs.writeFileSync(groupsPath, content, 'utf-8');
}

export function loadEndpoints(cwd: string = process.cwd()): ApiEndpoint[] {
  const endpointsDir = path.join(getConfigDir(cwd), ENDPOINTS_DIR);
  if (!fs.existsSync(endpointsDir)) {
    return [];
  }
  const endpoints: ApiEndpoint[] = [];
  const files = fs.readdirSync(endpointsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(endpointsDir, file), 'utf-8');
    endpoints.push(yaml.load(content) as ApiEndpoint);
  }
  return endpoints.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadEndpoint(id: string, cwd: string = process.cwd()): ApiEndpoint | null {
  const endpoints = loadEndpoints(cwd);
  return endpoints.find(e => e.id === id) || null;
}

export function findEndpointByNameOrId(query: string, cwd: string = process.cwd()): ApiEndpoint | null {
  const endpoints = loadEndpoints(cwd);
  return endpoints.find(e => e.id === query || e.name === query || e.path === query) || null;
}

export function saveEndpoint(endpoint: ApiEndpoint, cwd: string = process.cwd()): void {
  const endpointsDir = path.join(getConfigDir(cwd), ENDPOINTS_DIR);
  if (!fs.existsSync(endpointsDir)) {
    fs.mkdirSync(endpointsDir, { recursive: true });
  }
  const endpointPath = path.join(endpointsDir, `${endpoint.id}.yaml`);
  const content = yaml.dump(endpoint, { indent: 2 });
  fs.writeFileSync(endpointPath, content, 'utf-8');
}

export function deleteEndpoint(id: string, cwd: string = process.cwd()): boolean {
  const endpointPath = path.join(getConfigDir(cwd), ENDPOINTS_DIR, `${id}.yaml`);
  if (fs.existsSync(endpointPath)) {
    fs.unlinkSync(endpointPath);
    return true;
  }
  return false;
}

export function loadHistory(cwd: string = process.cwd(), limit?: number): HistoryEntry[] {
  const historyPath = path.join(getConfigDir(cwd), HISTORY_FILE);
  if (!fs.existsSync(historyPath)) {
    return [];
  }
  const content = fs.readFileSync(historyPath, 'utf-8');
  const history = JSON.parse(content) as HistoryEntry[];
  if (limit) {
    return history.slice(0, limit);
  }
  return history;
}

export function appendHistory(entry: HistoryEntry, cwd: string = process.cwd(), maxEntries: number = 200): void {
  const history = loadHistory(cwd);
  history.unshift(entry);
  if (history.length > maxEntries) {
    history.length = maxEntries;
  }
  const historyPath = path.join(getConfigDir(cwd), HISTORY_FILE);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), 'utf-8');
}

export function saveRunResult(result: RunResult, cwd: string = process.cwd()): void {
  const runsDir = path.join(getConfigDir(cwd), RUNS_DIR);
  if (!fs.existsSync(runsDir)) {
    fs.mkdirSync(runsDir, { recursive: true });
  }
  const runPath = path.join(runsDir, `${result.id}.json`);
  fs.writeFileSync(runPath, JSON.stringify(result, null, 2), 'utf-8');
}

export function loadRunResult(id: string, cwd: string = process.cwd()): RunResult | null {
  const runPath = path.join(getConfigDir(cwd), RUNS_DIR, `${id}.json`);
  if (!fs.existsSync(runPath)) {
    return null;
  }
  const content = fs.readFileSync(runPath, 'utf-8');
  return JSON.parse(content) as RunResult;
}

export function listRuns(cwd: string = process.cwd()): RunResult[] {
  const runsDir = path.join(getConfigDir(cwd), RUNS_DIR);
  if (!fs.existsSync(runsDir)) {
    return [];
  }
  const runs: RunResult[] = [];
  const files = fs.readdirSync(runsDir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(runsDir, file), 'utf-8');
    runs.push(JSON.parse(content) as RunResult);
  }
  return runs.sort((a, b) => b.timestamp - a.timestamp);
}

export function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}
