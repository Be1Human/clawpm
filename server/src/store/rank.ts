// Fractional rank：base36 字符串，字典序即兄弟排序。
// 在相邻两个 rank 之间插入节点只需为新节点生成一个 rank，不重写任何兄弟——
// 取代整数 sortOrder（拖拽排序需逐兄弟重写 = N 行 diff + git 合并冲突热点）。
//
// 不变式（同一兄弟组内）：
// - spreadRanks 一次性铺设的 rank 定宽且互不为前缀
// - rankBetween 生成的 rank 末位永不为 '0'，不会构造出 hi = lo + "0…" 的死区
// - 若外部手编/合并破坏了不变式导致无法插入，抛 RankError，调用方对该兄弟组重铺

const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
const BASE = 36;

export class RankError extends Error {}

function digit(ch: string): number {
  const d = DIGITS.indexOf(ch);
  if (d < 0) throw new RankError(`rank 含非法字符: '${ch}'`);
  return d;
}

function toBase36(n: number, width: number): string {
  let s = n.toString(36);
  if (s.length > width) throw new RankError(`toBase36 溢出: ${n} 超过宽度 ${width}`);
  return s.padStart(width, '0');
}

/**
 * 生成严格介于 a、b 之间的 rank。
 * a = null 视为负无穷，b = null 视为正无穷。
 */
export function rankBetween(a: string | null, b: string | null): string {
  const lo = a ?? '';
  const hi = b ?? '';
  if (hi !== '' && lo >= hi) {
    throw new RankError(`rankBetween 需要 a < b（得到 '${lo}' >= '${hi}'）`);
  }
  let prefix = '';
  for (let i = 0; ; i++) {
    const da = i < lo.length ? digit(lo[i]) : 0;
    let db: number;
    if (hi === '') {
      db = BASE;
    } else if (i < hi.length) {
      db = digit(hi[i]);
    } else {
      // hi 在共同前缀内被耗尽 => hi 是 lo 的前缀或 lo + "0…"，区间为空
      throw new RankError(`rank 区间为空，无法在 '${lo}' 与 '${hi}' 之间插入（需重铺该兄弟组）`);
    }
    if (da === db) {
      prefix += DIGITS[da];
      continue;
    }
    const mid = (da + db) >> 1;
    if (mid > da) return prefix + DIGITS[mid];
    // 间隙为 1（db = da + 1）：取 da 后，在 lo 的剩余位之上取更大值（此时无上界约束）
    prefix += DIGITS[da];
    for (let j = i + 1; ; j++) {
      const d = j < lo.length ? digit(lo[j]) : 0;
      if (d === BASE - 1) {
        prefix += DIGITS[d];
        continue;
      }
      return prefix + DIGITS[(d + BASE) >> 1];
    }
  }
}

/** 空列表的首个 rank */
export function firstRank(): string {
  return rankBetween(null, null);
}

/** 追加到末尾 */
export function rankAfter(last: string | null): string {
  return rankBetween(last, null);
}

/**
 * 为 n 个已排序兄弟一次性生成等距 rank（初始铺设 / doctor 重铺）。
 * 定宽输出保证互不为前缀；密度留一倍余量，后续插入走 rankBetween。
 */
export function spreadRanks(n: number): string[] {
  if (n <= 0) return [];
  let width = 2;
  while (Math.pow(BASE, width) < 2 * (n + 1)) width++;
  const step = Math.floor(Math.pow(BASE, width) / (n + 1));
  const out: string[] = [];
  for (let i = 1; i <= n; i++) out.push(toBase36(i * step, width));
  return out;
}

/** 兄弟排序比较：rank 字典序，缺失 rank 的排最后，平局由调用方按 id 决 */
export function compareRanks(a: string | undefined, b: string | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}
