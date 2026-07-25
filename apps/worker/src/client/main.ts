/**
 * LINE Harness LIFF — The single entry point
 *
 * This URL IS the friend-add URL. Every user enters through here.
 *
 * Flow:
 *   LIFF URL → LINE Login (auto in LINE app) → UUID issued
 *   → friendship check → not friend? show add button → friend added → Webhook → scenario enroll
 *   → already friend? → show completion
 *
 * Query params:
 *   ?ref=xxx          — attribution tracking (which LP/campaign)
 *   ?redirect=x       — redirect after linking (for wrapped URLs)
 *   ?page=book        — booking page (calendar slot picker, Google Calendar)
 *   ?page=salon-book  — salon booking flow (React, dynamic-imported)
 */

import { initBooking } from './booking.js';
import { initForm } from './form.js';

declare const liff: {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(opts?: { redirectUri?: string }): void;
  getProfile(): Promise<{ userId: string; displayName: string; pictureUrl?: string; statusMessage?: string }>;
  getIDToken(): string | null;
  getDecodedIDToken(): { sub: string; name?: string; email?: string; picture?: string } | null;
  getFriendship(): Promise<{ friendFlag: boolean }>;
  isInClient(): boolean;
  closeWindow(): void;
};

// Resolve LIFF ID: ?liffId= param (from endpoint URL) > env var (fallback to ①)
function detectLiffId(): string {
  const fromParam = new URLSearchParams(window.location.search).get('liffId');
  if (fromParam) return fromParam;
  return import.meta.env?.VITE_LIFF_ID || '';
}
const LIFF_ID = detectLiffId();
if (!LIFF_ID) {
  throw new Error('LIFF ID not found. Set ?liffId= in LIFF endpoint URL or VITE_LIFF_ID env.');
}
const UUID_STORAGE_KEY = 'lh_uuid';
// Bot basic ID — resolved dynamically from API after liff.init()
let BOT_BASIC_ID = '';

function apiCall(path: string, options?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

function getPage(): string | null {
  const path = window.location.pathname.replace(/^\/+/, '');
  if (path === 'book') return 'book';
  const params = new URLSearchParams(window.location.search);
  return params.get('page');
}

function getRedirectUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('redirect');
}

function getRef(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('ref');
}

function getSavedUuid(): string | null {
  try {
    return localStorage.getItem(UUID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveUuid(uuid: string): void {
  try {
    localStorage.setItem(UUID_STORAGE_KEY, uuid);
  } catch {
    // silent fail
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ─── UI States ──────────────────────────────────────────

function showFriendAdd(profile: { displayName: string; pictureUrl?: string }) {
  const container = document.getElementById('app')!;
  const friendAddUrl = BOT_BASIC_ID
    ? `https://line.me/R/ti/p/${BOT_BASIC_ID}`
    : '#';

  container.innerHTML = `
    <div class="card">
      <div class="profile">
        ${profile.pictureUrl ? `<img src="${profile.pictureUrl}" alt="" />` : ''}
        <p class="name">${escapeHtml(profile.displayName)} さん</p>
      </div>
      <p class="message">まずは友だち追加をお願いします</p>
      <a href="${friendAddUrl}" class="add-friend-btn" id="addFriendBtn">
        友だち追加して始める
      </a>
      <p class="sub-message">追加後、この画面に戻ってきてください</p>
    </div>
  `;

  // 友だち追加後に戻ってきたら自動で再チェック
  // 一度発火したら listener を外して、ユーザーが LIFF をフォアグラウンド復帰するたびに
  // 重複 push が走らないようにする（送信後にアプリ切り替えで再発火する事故を防ぐ）
  let formLinkSent = false;
  const onVisibilityChange = async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const { friendFlag } = await liff.getFriendship();
      if (!friendFlag) return;

      // Send form link if form param exists (was lost during friend-add flow)
      const formParam = new URLSearchParams(window.location.search).get('form');
      if (formParam && !formLinkSent) {
        formLinkSent = true;
        try {
          const fp = await liff.getProfile();
          const idToken = liff.getIDToken();
          const params = new URLSearchParams(window.location.search);
          await apiCall('/api/liff/send-form-link', {
            method: 'POST',
            body: JSON.stringify({
              lineUserId: fp.userId,
              formId: formParam,
              idToken: idToken || '',
              ref: params.get('ref') || '',
              gate: params.get('gate') || '',
              xh: params.get('xh') || '',
              ig: params.get('ig') || '',
            }),
          });
        } catch { /* best-effort */ }
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
      showCompletion(profile, false);
    } catch {
      // ignore
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
}

function showCompletion(profile: { displayName: string; pictureUrl?: string }, isRecovery: boolean) {
  const container = document.getElementById('app')!;
  const ref = getRef();
  container.innerHTML = `
    <div class="card">
      <div class="check-icon">${isRecovery ? '🔄' : '✓'}</div>
      <h2>${isRecovery ? 'おかえりなさい！' : '登録完了！'}</h2>
      <div class="profile">
        ${profile.pictureUrl ? `<img src="${profile.pictureUrl}" alt="" />` : ''}
        <p class="name">${escapeHtml(profile.displayName)} さん</p>
      </div>
      <p class="message">
        ${isRecovery
          ? '以前のアカウント情報を引き継ぎました。'
          : 'ありがとうございます！これからお役立ち情報をお届けします。'
        }
        <br>このページは閉じて大丈夫です。
      </p>
      ${ref ? `<p class="ref-badge">${escapeHtml(ref)}</p>` : ''}
    </div>
  `;

  // 2秒後にトーク画面に遷移（BOT_BASIC_ID が設定されている場合のみ）
  if (BOT_BASIC_ID) {
    setTimeout(() => {
      window.location.href = `https://line.me/R/oaMessage/${BOT_BASIC_ID}/`;
    }, 2000);
  }
}

function showError(message: string) {
  const container = document.getElementById('app')!;
  container.innerHTML = `
    <div class="card">
      <h2>エラー</h2>
      <p class="error">${escapeHtml(message)}</p>
    </div>
  `;
}

// ─── Core Flow ──────────────────────────────────────────

async function linkAndAddFlow() {
  const redirectUrl = getRedirectUrl();
  const ref = getRef();

  try {
    const existingUuid = getSavedUuid();

    // Get profile, ID token, and friendship status in parallel
    const [profile, rawIdToken, friendship] = await Promise.all([
      liff.getProfile(),
      Promise.resolve(liff.getIDToken()),
      liff.getFriendship(),
    ]);

    // 1. UUID linking (always, regardless of friendship)
    const linkParams = new URLSearchParams(window.location.search);
    const linkPromise = apiCall('/api/liff/link', {
      method: 'POST',
      body: JSON.stringify({
        idToken: rawIdToken,
        displayName: profile.displayName,
        existingUuid: existingUuid,
        ref: ref,
        ig: linkParams.get('ig') || '',
      }),
    }).then(async (res) => {
      if (res.ok) {
        const data = await res.json() as { success: boolean; data?: { userId?: string } };
        if (data?.data?.userId) {
          saveUuid(data.data.userId);
        }
      }
      return res;
    }).catch(() => {
      // Silent fail — UUID linking is best-effort
    });

    // 2. Attribution tracking
    if (ref) {
      apiCall('/api/affiliates/click', {
        method: 'POST',
        body: JSON.stringify({ code: ref, url: window.location.href }),
      }).catch(() => {});
    }

    // 3. Redirect flow (for wrapped URLs)
    if (redirectUrl) {
      await Promise.race([
        linkPromise,
        new Promise((r) => setTimeout(r, 500)),
      ]);
      // Append LINE userId to tracking links so clicks are attributed
      if (redirectUrl.includes('/t/')) {
        const sep = redirectUrl.includes('?') ? '&' : '?';
        window.location.href = `${redirectUrl}${sep}lu=${encodeURIComponent(profile.userId)}`;
      } else {
        window.location.href = redirectUrl;
      }
      return;
    }

    // 4. Wait for UUID linking to complete
    await linkPromise;

    // 5. Friendship check — the key decision point
    if (!friendship.friendFlag) {
      // Not a friend yet → show friend-add button
      showFriendAdd(profile);
    } else {
      // Already a friend — check for form param
      const formParam = new URLSearchParams(window.location.search).get('form');
      if (formParam) {
        // Send form link via push message, then show completion
        try {
          const idToken = liff.getIDToken();
          const params = new URLSearchParams(window.location.search);
          await apiCall('/api/liff/send-form-link', {
            method: 'POST',
            body: JSON.stringify({
              lineUserId: profile.userId,
              formId: formParam,
              idToken: idToken || '',
              ref: ref || '',
              gate: params.get('gate') || '',
              xh: params.get('xh') || '',
              ig: params.get('ig') || '',
            }),
          });
        } catch { /* best-effort */ }
        showCompletion(profile, !!existingUuid);
      } else {
        showCompletion(profile, !!existingUuid);
      }
    }

  } catch (err) {
    if (redirectUrl) {
      window.location.href = redirectUrl;
    } else {
      showError(err instanceof Error ? err.message : 'エラーが発生しました');
    }
  }
}

// ─── Salon Booking (React, dynamic-imported) ─────────────

async function initSalonBooking(): Promise<void> {
  // 既存 linkAndAddFlow と同じ初期化シーケンスを踏む:
  //   ① profile + idToken + friendFlag を並列取得
  //   ② /api/liff/link で UUID 確定 (ref/ig 含む) — booking エンドポイントが
  //      id_token verify で friend を引くために friends 行が必要
  //   ③ ref があれば /api/affiliates/click で流入計測
  //   ④ 未友達なら showFriendAdd (friend-add gate)。友達追加後に同じ URL に
  //      戻ってくれば再度ここを通って React mount に進む
  //   ⑤ 友達なら React チャンクを動的 import して mount
  const [profile, idToken, friendship] = await Promise.all([
    liff.getProfile(),
    Promise.resolve(liff.getIDToken()),
    liff.getFriendship(),
  ]);
  if (!idToken) {
    showError('LINE 認証情報の取得に失敗しました。LINE アプリ内で再度開いてください。');
    return;
  }

  const existingUuid = getSavedUuid();
  const ref = getRef();
  const ig = new URLSearchParams(window.location.search).get('ig');

  // ② Silent UUID linking (fire-and-forget; booking API は id_token verify で
  //    認証するので待つ必要はない)。
  apiCall('/api/liff/link', {
    method: 'POST',
    body: JSON.stringify({
      idToken,
      displayName: profile.displayName,
      existingUuid,
      ref: ref || undefined,
      ig: ig || undefined,
    }),
  })
    .then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { userId?: string } };
        if (data?.data?.userId) saveUuid(data.data.userId);
      }
    })
    .catch(() => {
      /* silent */
    });

  // ③ Affiliate click 計測 (linkAndAddFlow と同等)。
  if (ref) {
    apiCall('/api/affiliates/click', {
      method: 'POST',
      body: JSON.stringify({ code: ref, url: window.location.href }),
    }).catch(() => {
      /* silent */
    });
  }

  // ④ 未友達なら friend-add UI に流す。booking API は friends.is_following = 1
  //    を要求するので、ここを skip すると最終的に cannot_book / friend_not_found
  //    で詰む。
  if (!friendship.friendFlag) {
    showFriendAdd(profile);
    return;
  }

  // ⑤ React + Tailwind チャンクを動的 import → 既存 LIFF 利用者には load されない。
  const container = document.getElementById('app');
  if (!container) {
    showError('mount target #app が見つかりません');
    return;
  }
  const { mountSalonBooking } = await import('./salon-booking/main.js');
  mountSalonBooking(container, {
    liffId: LIFF_ID,
    lineUserId: profile.userId,
    idToken,
  });
}

// ─── Event Booking (React, dynamic-imported) ─────────────

async function initEventBooking(initialKind: 'detail' | 'history'): Promise<void> {
  // salon-booking と同じ初期化シーケンス: profile/idToken/friendship 取得、
  // 未友達なら friend-add gate、友達なら React mount。
  const [profile, idToken, friendship] = await Promise.all([
    liff.getProfile(),
    Promise.resolve(liff.getIDToken()),
    liff.getFriendship(),
  ]);
  if (!idToken) {
    showError('LINE 認証情報の取得に失敗しました。LINE アプリ内で再度開いてください。');
    return;
  }

  const existingUuid = getSavedUuid();
  const ref = getRef();

  // UUID linking (best-effort)
  apiCall('/api/liff/link', {
    method: 'POST',
    body: JSON.stringify({
      idToken,
      displayName: profile.displayName,
      existingUuid,
      ref: ref || undefined,
    }),
  })
    .then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { userId?: string } };
        if (data?.data?.userId) saveUuid(data.data.userId);
      }
    })
    .catch(() => {
      /* silent */
    });

  if (!friendship.friendFlag) {
    showFriendAdd(profile);
    return;
  }

  const container = document.getElementById('app');
  if (!container) {
    showError('mount target #app が見つかりません');
    return;
  }
  const params = new URLSearchParams(window.location.search);
  const eventId = params.get('id') ?? '';
  if (initialKind === 'detail' && !eventId) {
    showError('id クエリパラメータが必要です（?page=event&id=<eventId>）');
    return;
  }
  const { mountEventBooking } = await import('./event-booking/main.js');
  const ctx = { liffId: LIFF_ID, lineUserId: profile.userId, idToken };
  const initial = initialKind === 'detail'
    ? { kind: 'detail' as const, eventId }
    : { kind: 'history' as const };
  mountEventBooking(container, ctx, initial);
}

// ─── Gate (キャンペーン用: お立場ゲート) ─────────────────
//
// 外食サミットの診断ゲートと同じ発想の、in-page 出し分け。
// 同じ URL を、
//   ・未フォロー           → 友だち追加ボタン（追加後にゲート判定へ）
//   ・お立場「飲食店」登録済 → アンケート依頼カード（フォームボタン）
//   ・お立場「非飲食」登録済 → お断りカード
//   ・お立場 未登録         → お立場カード（飲食店／非飲食のボタン）
// に出し分ける。チャットpushに依存せず、すべて LIFF ページ内に描画する。

interface GateConfig {
  ref: string | null;
  survey: string | null;    // アンケートフォームID
  food: string | null;      // お立場フォーム（飲食店）ID
  nonfood: string | null;   // お立場フォーム（非飲食）ID
  foodTag: string | null;   // 飲食店タグID
  nonfoodTag: string | null; // 非飲食タグID
  foodTpl: string | null;    // アンケート案内テンプレートID
  nonfoodTpl: string | null; // お断りテンプレートID
  roleTpl: string | null;    // お立場カードのテンプレートID
}

function getGateConfig(): GateConfig {
  const p = new URLSearchParams(window.location.search);
  return {
    ref: p.get('ref'),
    survey: p.get('survey'),
    food: p.get('food'),
    nonfood: p.get('nonfood'),
    foodTag: p.get('food_tag'),
    nonfoodTag: p.get('nonfood_tag'),
    foodTpl: p.get('food_tpl'),
    nonfoodTpl: p.get('nonfood_tpl'),
    roleTpl: p.get('role_tpl'),
  };
}

function formUrl(formId: string): string {
  // 同じ LIFF エンドポイント内でフォームページへ遷移（ログイン済みなので再認証不要）
  return `${window.location.pathname}?page=form&id=${encodeURIComponent(formId)}`;
}

function renderCard(inner: string): void {
  const container = document.getElementById('app')!;
  container.innerHTML = `<div class="card">${inner}</div>`;
}

// アンケートのリンクをトークにも1通だけ送る。
// 「今は時間がない」人が離脱しても、トークに残ったリンクから後で回答できる。
// 端末をまたいでも二重送信しないよう、localStorage と メモリ両方で見張る。
let _gateLinkPushed = false;

function gateSentKey(formId: string): string {
  return `lh_gate_link_sent_${formId}`;
}

function pushSurveyLinkToTalk(): void {
  const cfg = getGateConfig();
  if (!cfg.survey || _gateLinkPushed) return;
  try {
    if (localStorage.getItem(gateSentKey(cfg.survey))) return;
  } catch { /* localStorage 不可でもメモリ側の見張りで足りる */ }
  _gateLinkPushed = true;

  void (async () => {
    try {
      const profile = await liff.getProfile();
      const idToken = liff.getIDToken();
      const res = await apiCall('/api/liff/send-form-link', {
        method: 'POST',
        body: JSON.stringify({
          lineUserId: profile.userId,
          formId: cfg.survey,
          idToken: idToken || '',
          ref: cfg.ref || '',
        }),
      });
      if (res.ok) {
        try { localStorage.setItem(gateSentKey(cfg.survey!), String(Date.now())); } catch { /* silent */ }
      } else {
        _gateLinkPushed = false; // 失敗したら次の機会に再送を許す
      }
    } catch {
      _gateLinkPushed = false;
    }
  })();
}

function showGateSurvey(): void {
  const cfg = getGateConfig();
  // トークにもリンクを送っておく（後回しにする人の取りこぼしを防ぐ）
  pushSurveyLinkToTalk();
  renderCard(`
    <h2>アンケートのお願い</h2>
    <p class="message">
      いつもありがとうございます。<br>
      「特定技能1号『外食業』受入停止に関する飲食業界実態調査」へのご協力をお願いいたします。<br>
      現場の声を集め、業界の実態を国や関係機関へ届けるための調査です。
    </p>
    ${cfg.survey
      ? `<a href="${formUrl(cfg.survey)}" class="add-friend-btn">アンケートに回答する</a>`
      : `<p class="error">フォームが設定されていません。</p>`}
    <p class="sub-message" style="margin-top:14px;text-align:left;line-height:1.7;">
      いまお時間がない方は、このまま閉じていただいて大丈夫です。<br>
      <strong>トーク画面にアンケートのリンクをお送りしています</strong>ので、
      後ほどご都合のよいときにご回答ください。<br>
      回答は自動保存されますので、途中で中断しても続きから再開できます。
    </p>
  `);
}

function showGateRole(): void {
  // お立場カード（飲食業／それ以外の二択）。回答に応じて、そのまま
  // 同じ画面内でアンケート依頼（飲食業）／お断り（それ以外）へ遷移する。
  // チャットへのpushに依存しないので「アンケートが出てこない」問題が起きない。
  renderCard(`
    <h2>はじめに</h2>
    <p class="message">
      ご登録ありがとうございます。<br>
      本アンケートは、飲食店の経営・運営に携わる方を対象にしています。<br>
      あなたのお立場をお聞かせください。
    </p>
    <button type="button" class="add-friend-btn" id="gateRoleFood">飲食店の経営・運営に携わっている</button>
    <button type="button" class="add-friend-btn" id="gateRoleOther" style="margin-top:12px;background:#f0f0f0;color:#333;">それ以外</button>
  `);
  document.getElementById('gateRoleFood')?.addEventListener('click', () => showGateSurvey());
  document.getElementById('gateRoleOther')?.addEventListener('click', () => showGateDecline());
}

function showGateDecline(): void {
  renderCard(`
    <div class="check-icon">🙏</div>
    <h2>ありがとうございます</h2>
    <p class="message">
      今回のアンケートは飲食店の方を対象に実施しております。<br>
      ご関心をお寄せいただきありがとうございました。<br>
      引き続き、食団連からの情報をお届けします。
    </p>
  `);
}

/**
 * 画面下部に診断情報を出す（`&debug=1` のときだけ）。
 *
 * ゲートは「押しても何も起きない」形で失敗すると原因が全く分からない
 * （実機のログが手元で見えないため）。調査時に URL へ `&debug=1` を足せば
 * どこで止まったかが画面に出る。配布URLには付けないので利用者には見えない。
 */
function showGateDiag(info: string): void {
  // 既定では出さない。技術的な文言は一般の利用者には不親切なうえ不安を与える。
  // 失敗時の行き止まりはフォールバック表示（お立場カード）で回避しているので、
  // 診断は調査時だけ `&debug=1` を付けて有効にする。
  if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
  const app = document.getElementById('app');
  if (!app) return;
  const el = document.createElement('p');
  el.style.cssText = 'font-size:11px;color:#9aa0a6;margin-top:16px;text-align:center;word-break:break-all;line-height:1.6;';
  el.textContent = `診断: ${info}`;
  app.appendChild(el);
}

/** 案内はトークに届いた、と伝えてこの画面を閉じる。 */
function showTalkHandoff(): void {
  renderCard(`
    <div class="check-icon">💬</div>
    <h2>ご案内をトークにお送りしました</h2>
    <p class="message">
      このままトーク画面に移動します。
    </p>
  `);

  // トーク画面へ能動的に移動する。
  //
  // closeWindow だけだと「どこに戻るか」が LIFF の開き方に依存し、
  // 公式アカウントのトークとは限らない（SNS や外部ブラウザから来た場合は
  // LINE のホーム等に戻る）。カードはトークに届いているので、そこへ
  // 連れて行かないと利用者はカードを見ずに終わってしまう。
  // BOT_BASIC_ID が取れなかったときだけ、従来どおり閉じる。
  setTimeout(() => {
    if (BOT_BASIC_ID) {
      window.location.href = `https://line.me/R/oaMessage/${BOT_BASIC_ID}/`;
      return;
    }
    if (liff.isInClient()) {
      try { liff.closeWindow(); } catch { /* ignore */ }
    }
  }, 1600);
}

/**
 * 判定して、対応する案内を**トークに送る**。
 *
 * LIFF のページ内に出す方式は、友だち追加の直後に LINE がトーク画面へ
 * 着地するため成立しない（利用者は「LIFF に戻る」操作を認識できない）。
 * そのため案内はすべてトークに送り、この画面は閉じるだけにする。
 * push できなかった場合だけ、行き止まりを避けるため画面内に表示する。
 */
async function routeGate(idToken: string | null): Promise<void> {
  const cfg = getGateConfig();
  // idToken が無いと本人確認ができず必ず 401 になる。原因が分かるように明示する。
  if (!idToken) {
    showGateRole();
    showGateDiag('LINEの認証情報(idToken)を取得できませんでした。LINEアプリ内で開いてください。');
    return;
  }
  try {
    const res = await apiCall('/api/liff/gate', {
      method: 'POST',
      body: JSON.stringify({
        idToken: idToken || '',
        foodTagId: cfg.foodTag || '',
        nonfoodTagId: cfg.nonfoodTag || '',
        push: true,
        surveyFormId: cfg.survey || '',
        foodTemplateId: cfg.foodTpl || '',
        nonfoodTemplateId: cfg.nonfoodTpl || '',
        roleTemplateId: cfg.roleTpl || '',
      }),
    });
    const raw = await res.text();
    let json: {
      success?: boolean;
      error?: string;
      data?: {
        segment?: 'food' | 'nonfood' | null;
        pushed?: boolean;
        pushSkipReason?: string | null;
      };
    } = {};
    try { json = JSON.parse(raw); } catch { /* 非JSON応答 */ }
    const data = json?.data;

    // トークに送れた（または直前に同じ案内が届いている）ならトークへ誘導する
    if (data?.pushed || data?.pushSkipReason === 'recently_sent') {
      showTalkHandoff();
      if (data?.pushSkipReason === 'recently_sent') {
        showGateDiag('直近3分に同じ案内を送っているため、今回は送信を省略しました。');
      }
      return;
    }

    // ここに来るのは push できなかった場合のみ。
    // 何も出さないと行き止まりになるので、画面内に表示しつつ理由を出す。
    const segment = data?.segment ?? null;
    const why = data?.pushSkipReason
      || json?.error
      || (res.ok ? 'unknown' : `HTTP ${res.status}`);
    setTimeout(() => showGateDiag(`送信できませんでした（${why} / segment=${segment ?? 'なし'}）`), 0);
    if (segment === 'food') {
      showGateSurvey();
    } else if (segment === 'nonfood') {
      showGateDecline();
    } else {
      showGateRole();
    }
  } catch (err) {
    // 判定できないときは、お立場カードから始める（安全側）
    showGateRole();
    showGateDiag(`通信エラー: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function showGateFriendAdd(
  profile: { displayName: string; pictureUrl?: string },
  idToken: string | null,
): void {
  const container = document.getElementById('app')!;
  const friendAddUrl = BOT_BASIC_ID ? `https://line.me/R/ti/p/${BOT_BASIC_ID}` : '#';
  container.innerHTML = `
    <div class="card">
      <div class="profile">
        ${profile.pictureUrl ? `<img src="${profile.pictureUrl}" alt="" />` : ''}
        <p class="name">${escapeHtml(profile.displayName)} さん</p>
      </div>
      <p class="message">
        飲食業界実態調査にご協力ください。<br>
        まずは食団連公式アカウントの友だち追加をお願いします。
      </p>
      <a href="${friendAddUrl}" class="add-friend-btn" id="addFriendBtn">友だち追加して続ける</a>
      <p class="sub-message">
        追加すると、そのまま<strong>トーク画面にご案内が届きます</strong>。<br>
        この画面に戻る必要はありません。
      </p>
    </div>
  `;

  // 追加後にこの画面へ戻ってきた場合の保険。
  // 通常は friend_add のあいさつがトークに案内を出すので、ここでは
  // 「トークを見てください」と伝えるだけでよい。ただし再追加などで
  // あいさつが発火しないことがあるため、ゲート判定も呼んでおく
  // （サーバー側に直近3分の二重送信ガードがあるので重複しない）。
  let routed = false;
  const onVisibilityChange = async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const { friendFlag } = await liff.getFriendship();
      if (!friendFlag || routed) return;
      routed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // 追加直後は friends 行の反映が遅れることがあるため、少し待ってから判定
      await new Promise((r) => setTimeout(r, 1200));
      await routeGate(idToken);
    } catch {
      // ignore
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
}

async function initGate(): Promise<void> {
  const cfg = getGateConfig();
  const existingUuid = getSavedUuid();

  const [profile, rawIdToken, friendship] = await Promise.all([
    liff.getProfile(),
    Promise.resolve(liff.getIDToken()),
    liff.getFriendship(),
  ]);

  // 属性づけ（ref のトラッキング）と UUID 連携（best-effort）
  const linkParams = new URLSearchParams(window.location.search);
  const linkPromise = apiCall('/api/liff/link', {
    method: 'POST',
    body: JSON.stringify({
      idToken: rawIdToken,
      displayName: profile.displayName,
      existingUuid,
      ref: cfg.ref,
      ig: linkParams.get('ig') || '',
    }),
  })
    .then(async (res) => {
      if (res.ok) {
        const data = (await res.json()) as { success: boolean; data?: { userId?: string } };
        if (data?.data?.userId) saveUuid(data.data.userId);
      }
    })
    .catch(() => {});

  if (cfg.ref) {
    apiCall('/api/affiliates/click', {
      method: 'POST',
      body: JSON.stringify({ code: cfg.ref, url: window.location.href }),
    }).catch(() => {});
  }

  if (!friendship.friendFlag) {
    // 未フォロー → 友だち追加。追加後に戻ってきたらゲート判定へ。
    showGateFriendAdd(profile, rawIdToken);
    return;
  }

  // フォロー済み → link 完了を待ってからゲート判定
  await linkPromise;
  await routeGate(rawIdToken);
}

// ─── Entry Point ────────────────────────────────────────

async function main() {
  try {
    await liff.init({ liffId: LIFF_ID });

    if (!liff.isLoggedIn()) {
      liff.login({ redirectUri: window.location.href });
      return;
    }

    // Resolve bot basic ID from API (multi-account support)
    try {
      const configRes = await fetch(`/api/liff/config?liffId=${encodeURIComponent(LIFF_ID)}`);
      const configJson = await configRes.json() as { success: boolean; data?: { botBasicId?: string } };
      if (configJson.success && configJson.data?.botBasicId) {
        BOT_BASIC_ID = configJson.data.botBasicId;
      }
    } catch {
      // fallback: BOT_BASIC_ID remains empty, friend-add URL won't auto-redirect
    }

    const page = getPage();
    if (page === 'book') {
      await initBooking();
    } else if (page === 'salon-book') {
      await initSalonBooking();
    } else if (page === 'event') {
      await initEventBooking('detail');
    } else if (page === 'event-me') {
      await initEventBooking('history');
    } else if (page === 'form') {
      const params = new URLSearchParams(window.location.search);
      const formId = params.get('id');
      await initForm(formId);
    } else if (page === 'gate') {
      try {
        await initGate();
      } catch (err) {
        showGateRole();
        showGateDiag(`初期化エラー: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else if (!page) {
      await linkAndAddFlow();
    } else {
      await linkAndAddFlow();
    }
  } catch (err) {
    showError(err instanceof Error ? err.message : 'LIFF初期化エラー');
  }
}

main();
