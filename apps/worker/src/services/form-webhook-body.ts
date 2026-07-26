/**
 * フォーム送信を Webhook（Googleスプレッドシート等）へ送るときの本文を組み立てる。
 *
 * 回答そのものに加えて、**流入元** を足します。これが無いと「どの配布先URLから
 * 何件回答が来たか」を集計できません。
 *
 * ## どの ref を載せるか
 *
 * 流入元は2つの見方があります。
 *
 * - ファーストタッチ … `friends.ref_code`。最初に踏んだ入口。上書きしない
 * - ラストタッチ     … `ref_tracking` の最新行。直近に踏んだ入口
 *
 * ここで欲しいのは「この回答者が**今回**どの配布先URLから来たか」なので
 * **ラストタッチを優先**します。ファーストタッチだと、既存フォロワーが配布先URLを
 * 踏んで回答しても昔の入口が出てしまい、配布先別に数えられません
 * （実際にそれで数えられませんでした）。
 *
 * ## 設計上の約束
 *
 * 1. **回答の値は絶対に上書きしない**。同名の設問がある場合は回答を優先します。
 *    集計のための付加情報が、実際の回答を壊してよい理由にはなりません。
 * 2. **回答オブジェクトの構造は変えない**（キーを足すだけ）。受け側の
 *    スクリプトが未知のキーを無視する作りなら、受け側を直すまで**何も起きません**。
 */
export interface WebhookRefInfo {
  /** 今回の流入元。ラストタッチ優先 */
  ref?: string | null;
  /** 流入元の表示名（例「東京都飲食業組合」）。UUIDのままでは読めないため */
  refName?: string | null;
}

export function buildWebhookBody(
  submissionData: Record<string, unknown>,
  refInfo?: WebhookRefInfo | null,
): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  if (refInfo?.ref) extra.ref = refInfo.ref;
  if (refInfo?.refName) extra.ref_name = refInfo.refName;

  if (Object.keys(extra).length === 0) return submissionData;
  // 付加情報を先に置くことで、同名の設問があれば回答側が勝つ
  return { ...extra, ...submissionData };
}

/**
 * 今回の流入元を決める。ラストタッチが無ければファーストタッチで代用する
 * （ref を1度も踏まずに友だちになった人などのため）。
 */
export function resolveRefForSubmission(
  lastRefCode: string | null | undefined,
  firstRefCode: string | null | undefined,
): string | null {
  return lastRefCode ?? firstRefCode ?? null;
}
