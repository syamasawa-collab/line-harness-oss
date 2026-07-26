/**
 * フォーム送信を Webhook（Googleスプレッドシート等）へ送るときの本文を組み立てる。
 *
 * 回答そのものに加えて、**流入元（`ref`）** を1つだけ足します。これが無いと
 * 「どの配布先から何件回答が来たか」を集計できません（友だちの人数は
 * `friends.ref_code` で分かるが、回答は紐づかない）。
 *
 * 設計上の約束が2つあります。
 *
 * 1. **回答の値は絶対に上書きしない**。同名の設問がある場合は回答を優先します。
 *    集計のための付加情報が、実際の回答を壊してよい理由にはなりません。
 * 2. **回答オブジェクトの構造は変えない**（キーを1つ増やすだけ）。受け側の
 *    スクリプトが未知のキーを無視する作りなら、受け側を直すまで**何も起きません**。
 */
export function buildWebhookBody(
  submissionData: Record<string, unknown>,
  refCode: string | null | undefined,
): Record<string, unknown> {
  if (!refCode) return submissionData;
  // ref を先に置くことで、同名の設問があれば回答側が勝つ
  return { ref: refCode, ...submissionData };
}
