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

function showGateSurvey(): void {
  const cfg = getGateConfig();
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
  `);
}

function showGateRole(): void {
  const cfg = getGateConfig();
  renderCard(`
    <h2>はじめに</h2>
    <p class="message">
      ご登録ありがとうございます。<br>
      まずはあなたのお立場をお聞かせください。
    </p>
    ${cfg.food
      ? `<a href="${formUrl(cfg.food)}" class="add-friend-btn">飲食店の方はこちら</a>`
      : ''}
    ${cfg.nonfood
      ? `<a href="${formUrl(cfg.nonfood)}" class="add-friend-btn" style="margin-top:12px;background:#f0f0f0;color:#333;">飲食店以外の方はこちら</a>`
      : ''}
  `);
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

async function routeGate(idToken: string | null): Promise<void> {
  const cfg = getGateConfig();
  try {
    const res = await apiCall('/api/liff/gate', {
      method: 'POST',
      body: JSON.stringify({
        idToken: idToken || '',
        foodTagId: cfg.foodTag || '',
        nonfoodTagId: cfg.nonfoodTag || '',
      }),
    });
    const json = (await res.json()) as {
      success: boolean;
      data?: { segment?: 'food' | 'nonfood' | null };
    };
    const segment = json?.data?.segment ?? null;
    if (segment === 'food') {
      showGateSurvey();
    } else if (segment === 'nonfood') {
      showGateDecline();
    } else {
      showGateRole();
    }
  } catch {
    // 判定できないときは、お立場カードから始める（安全側）
    showGateRole();
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
      <p class="sub-message">追加後、この画面に戻ってきてください</p>
    </div>
  `;

  let routed = false;
  const onVisibilityChange = async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const { friendFlag } = await liff.getFriendship();
      if (!friendFlag || routed) return;
      routed = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // 追加直後は friends 行の反映が遅れることがあるため、少し待ってから判定
      await new Promise((r) => setTimeout(r, 800));
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
      await initGate();
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
