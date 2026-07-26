/**
 * フォームの回答内容に応じてタグを付け替える規則。
 *
 * on_submit_tag_id は「送信したら必ずこのタグを足す」だけなので、回答をやり直しても
 * 前の回答由来のタグが残る（例: 属性を「非飲食業」→「飲食業」に直しても「非飲食」タグが
 * 残ったまま）。tag_rules は removeTagIds を持つため、回答の変更に追従できる。
 */
export interface TagRule {
  /** 判定対象の項目名（fields[].name） */
  field: string;
  /** この値と一致したら適用。checkbox のように配列で来る回答は「含まれていれば一致」 */
  equals: string;
  addTagIds?: string[];
  removeTagIds?: string[];
}

export interface TagRuleResult {
  addTagIds: string[];
  removeTagIds: string[];
}

/** 回答値がルールの equals に一致するか。checkbox は配列で届く。 */
function matches(answer: unknown, equals: string): boolean {
  if (Array.isArray(answer)) return answer.some((v) => String(v) === equals);
  if (answer === undefined || answer === null) return false;
  return String(answer) === equals;
}

export function parseTagRules(raw: string | null | undefined): TagRule[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is TagRule =>
        !!r &&
        typeof r === 'object' &&
        typeof (r as TagRule).field === 'string' &&
        typeof (r as TagRule).equals === 'string',
    );
  } catch {
    return [];
  }
}

/**
 * 回答に対して適用すべきタグの追加・削除を解決する。
 *
 * 同じタグが add と remove の両方に現れた場合は add を優先する（複数ルールが
 * 重なったとき、付けたばかりのタグを別ルールが剥がしてしまうのを防ぐ）。
 */
export function resolveTagRules(
  rules: TagRule[],
  answers: Record<string, unknown>,
): TagRuleResult {
  const add = new Set<string>();
  const remove = new Set<string>();

  for (const rule of rules) {
    if (!matches(answers[rule.field], rule.equals)) continue;
    for (const id of rule.addTagIds ?? []) add.add(id);
    for (const id of rule.removeTagIds ?? []) remove.add(id);
  }

  for (const id of add) remove.delete(id);

  return { addTagIds: [...add], removeTagIds: [...remove] };
}
