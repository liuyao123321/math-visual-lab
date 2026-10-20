const terms = ["拉格朗日中值定理", "二阶导数为零", "导数等于零", "导数不存在", "导数为零", "一阶导数", "二阶导数", "必要条件", "充分条件", "平均变化率", "瞬时变化率", "复合函数", "链式法则", "左右导数", "水平切线", "闭区间", "开区间", "极大值", "极小值", "最大值", "最小值", "最高点", "最低点", "临界点", "绝对值", "不可导", "单调性", "中值定理", "驻点", "极值", "切线", "斜率", "导数", "求导", "递增", "递减", "连续", "可导", "凹凸", "拐点", "分母", "乘积", "分式", "定义域"];

export function normalizeQuery(text: string) {
  // NFC preserves mathematical superscripts/subscripts; NFKC would turn x²
  // into x2 and erase the structural distinction we need for retrieval.
  return text.normalize("NFC").toLowerCase().replace(/[−–]/g, "-").replace(/[’′]/g, "'").replace(/\s+/g, " ").trim();
}

export function tokenize(text: string): string[] {
  const normalized = normalizeQuery(text);
  const tokens: string[] = [...(normalized.match(/\\[a-z]+|[a-z]+(?:'[a-z]*)?|\d+(?:\.\d+)?|[⁰¹²³⁴⁵⁶⁷⁸⁹₀₁₂₃₄₅₆₇₈₉]+|[+\-*/^=<>≤≥≠]/g) ?? [])];
  for (const term of terms) if (normalized.includes(term)) tokens.push(term);
  for (const run of normalized.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let i = 0; i + 1 < run.length; i++) tokens.push(run.slice(i, i + 2));
  }
  return tokens;
}

// Deliberately conservative coverage gate for this first, chapter-scoped corpus.
// A topic match does not prove that any retrieved theorem applies to the problem.
export function inKnowledgeScope(text: string) {
  return /导数|求导|可导|连续|驻点|极值|极大|极小|最大值|最小值|最值|单调|递增|递减|切线|斜率|凹凸|拐点|罗尔|费马|拉格朗日|中值定理|链式|变化率|最高点|最低点|山顶|谷底|平的地方|水平.*线/.test(normalizeQuery(text));
}
