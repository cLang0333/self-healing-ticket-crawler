import type { Locator, Page } from '@playwright/test';

export type SelectorScope = Page | Locator;

/** 字符串是 CSS / Playwright 选择器；对象用来表达 role、label 等无法写成单一 CSS 的定位。 */
export type SelectorCandidate =
  | string
  | { name: string; locate: (scope: SelectorScope) => Locator };

export function describeCandidate(candidate: SelectorCandidate): string {
  return typeof candidate === 'string' ? candidate : candidate.name;
}

export function toLocator(scope: SelectorScope, candidate: SelectorCandidate): Locator {
  return typeof candidate === 'string' ? scope.locator(candidate) : candidate.locate(scope);
}

/**
 * 按顺序采用第一个「恰好匹配 1 个元素」的定位。
 * 前面的选择器失效（0 个）时才用后面的备份；某个备份匹配到多个则跳过，避免点错。
 */
export async function resolveOne(
  scope: SelectorScope,
  candidates: readonly SelectorCandidate[],
  label: string,
): Promise<Locator> {
  const counts: string[] = [];
  for (const candidate of candidates) {
    const locator = toLocator(scope, candidate);
    const count = await locator.count();
    counts.push(`${describeCandidate(candidate)} => ${count}`);
    if (count === 1) return locator;
  }
  throw new Error(`无法唯一解析「${label}」（需要恰好 1 个匹配）。${counts.join('；')}`);
}

/** 列表：采用第一个至少匹配 1 个元素的定位，避免两个备份并集把同一班次算两次。 */
export async function resolveFirstNonEmpty(
  scope: SelectorScope,
  candidates: readonly SelectorCandidate[],
  label: string,
): Promise<Locator> {
  const counts: string[] = [];
  for (const candidate of candidates) {
    const locator = toLocator(scope, candidate);
    const count = await locator.count();
    counts.push(`${describeCandidate(candidate)} => ${count}`);
    if (count > 0) return locator;
  }
  throw new Error(`无法解析「${label}」。${counts.join('；')}`);
}

export async function resolveOneWaiting(
  scope: SelectorScope,
  candidates: readonly SelectorCandidate[],
  label: string,
  timeoutMs: number,
): Promise<Locator> {
  const deadline = Date.now() + timeoutMs;
  let lastError = `无法唯一解析「${label}」`;
  while (Date.now() < deadline) {
    try {
      return await resolveOne(scope, candidates, label);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(lastError);
}

export async function optionalText(
  scope: SelectorScope,
  candidates: readonly SelectorCandidate[],
): Promise<string | null> {
  try {
    const locator = await resolveOne(scope, candidates, 'optional');
    return (await locator.innerText()).replace(/\s+/g, '');
  } catch {
    return null;
  }
}
