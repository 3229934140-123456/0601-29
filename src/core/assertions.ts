import { Assertion, AssertionResult, RequestResult } from '../types';

export function runAssertions(assertions: Assertion[], result: RequestResult): AssertionResult[] {
  return assertions
    .filter(a => a.enabled !== false)
    .map(assertion => runAssertion(assertion, result));
}

function runAssertion(assertion: Assertion, result: RequestResult): AssertionResult {
  let actual: any;
  let expected = assertion.value;

  switch (assertion.type) {
    case 'status':
      actual = result.response.status;
      break;
    case 'body':
      actual = result.response.body;
      break;
    case 'header':
      actual = result.response.headers[assertion.path || ''];
      break;
    case 'time':
      actual = result.response.time;
      break;
    case 'json-path':
      actual = getJsonPath(result.response.body, assertion.path || '');
      break;
    default:
      actual = undefined;
  }

  const passed = compareValues(actual, expected, assertion.operator);

  return {
    assertion,
    passed,
    actual,
    expected,
    message: passed ? `断言通过: ${assertion.name}` : `断言失败: ${assertion.name}`,
  };
}

function compareValues(actual: any, expected: any, operator: string): boolean {
  try {
    switch (operator) {
      case 'eq':
        return JSON.stringify(actual) === JSON.stringify(expected);
      case 'ne':
        return JSON.stringify(actual) !== JSON.stringify(expected);
      case 'gt':
        return Number(actual) > Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'contains':
        if (typeof actual === 'string') {
          return actual.includes(String(expected));
        }
        if (Array.isArray(actual)) {
          return actual.includes(expected);
        }
        if (typeof actual === 'object' && actual !== null) {
          return expected in actual;
        }
        return false;
      case 'regex':
        return new RegExp(expected).test(String(actual));
      case 'exists':
        return actual !== undefined && actual !== null;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

function getJsonPath(obj: any, path: string): any {
  if (!path) return undefined;
  const parts = path.replace(/^\$?\.?/, '').split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      current = current[arrayMatch[1]]?.[parseInt(arrayMatch[2], 10)];
    } else {
      current = current[part];
    }
  }
  return current;
}
