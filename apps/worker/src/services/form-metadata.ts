/**
 * フォーム送信データのうち、友だちの metadata に保存する分を決める。
 *
 * アンケートは設問が数十問あるため、全項目を metadata に入れると
 * 管理画面の友だち詳細が回答で埋まり、CRMとして使えなくなる。
 * 一方で氏名・会社名・メール・都道府県のような属性は友だちに残したい
 * （次のフォームの自動入力に使うし、アンケートでしか聞いていない属性が
 * 友だちに反映されないと二重管理になる）。
 *
 * - `save_to_metadata = 0` … 何も保存しない
 * - `metadata_fields` が配列 … その項目だけ保存する
 * - `metadata_fields` が未設定 … 全項目を保存する（従来の挙動）
 */
export interface FormMetadataPolicy {
  save_to_metadata: number | boolean;
  metadata_fields?: string | null;
}

/** metadata_fields をパースする。壊れた値は「未設定」として扱う。 */
export function parseMetadataFields(raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const names = parsed.filter((v): v is string => typeof v === 'string' && v.length > 0);
    return names.length > 0 ? names : [];
  } catch {
    return null;
  }
}

/**
 * 保存対象の項目だけを抜き出す。保存するものが無ければ null を返す
 * （呼び出し側は null のとき UPDATE を打たない）。
 */
export function pickMetadataToSave(
  form: FormMetadataPolicy,
  submissionData: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!form.save_to_metadata) return null;

  const allowed = parseMetadataFields(form.metadata_fields);
  if (allowed === null) {
    return Object.keys(submissionData).length > 0 ? { ...submissionData } : null;
  }

  const picked: Record<string, unknown> = {};
  for (const name of allowed) {
    if (name in submissionData) picked[name] = submissionData[name];
  }
  return Object.keys(picked).length > 0 ? picked : null;
}
