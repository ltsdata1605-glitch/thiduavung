// ==UserScript==
// @name         BI TGDD - Auto Copy Thi Đua (Tỉnh/Siêu Thị x Realtime/Lũy Kế)
// @namespace    tnb-thidua-autocopy
// @version      1.3
// @description  Tự động chuyển Realtime/Lũy kế + Thống kê theo khu vực/Siêu thị và copy dữ liệu bảng thi đua trên bi.thegioididong.com. Có nút AutoCopy trong dự án TNB mở cửa sổ này và tự nhận dữ liệu qua postMessage. Đánh dấu lên DOM của mọi trang để app phát hiện đã cài đặt.
// @match        https://bi.thegioididong.com/thi-dua*
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '1.3';

  // ---------------------------------------------------------------------
  // Presence-detection marker — runs on EVERY page (that's why @match
  // includes *://*/*), not just bi.thegioididong.com. The TNB app checks
  // for this attribute directly via the DOM instead of a postMessage
  // round-trip: Tampermonkey runs userscripts in its own sandboxed JS
  // context, and window.postMessage's `event.source` identity can fail to
  // compare equal to the page's own `window` across that sandbox boundary
  // depending on Tampermonkey's internals — the DOM tree itself has no such
  // ambiguity, isolated-world scripts and the page always share one document.
  // ---------------------------------------------------------------------
  const markInstalled = () => {
    if (document.documentElement) {
      document.documentElement.setAttribute('data-tnb-autocopy', SCRIPT_VERSION);
    } else {
      document.addEventListener('DOMContentLoaded', markInstalled, { once: true });
    }
  };
  markInstalled();

  // Everything below is specific to the BI site — the marker above is the
  // only thing that needs to run on the TNB app's own pages.
  if (location.hostname !== 'bi.thegioididong.com') return;

  // ---------------------------------------------------------------------
  // Storage helpers — GM_* persists across the full-page reload that
  // happens when we flip the `rt` URL param, so the script can resume the
  // "select scope + copy" steps automatically after the reload lands.
  // Falls back to sessionStorage if GM_* isn't available for any reason.
  // ---------------------------------------------------------------------
  const hasGM = typeof GM_setValue === 'function';
  function storeSet(key, val) {
    try {
      if (hasGM) GM_setValue(key, JSON.stringify(val));
      else sessionStorage.setItem(key, JSON.stringify(val));
    } catch (e) {}
  }
  function storeGet(key) {
    try {
      const raw = hasGM ? GM_getValue(key) : sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }
  function storeClear(key) {
    try {
      if (hasGM) GM_deleteValue(key);
      else sessionStorage.removeItem(key);
    } catch (e) {}
  }

  // ---------------------------------------------------------------------
  // Toast — ported straight from the working bookmarklet, minus the
  // `javascript:` IIFE wrapper. `sticky=true` skips the 5s auto-hide, for
  // "đang xử lý..." steps we manually replace with the next status.
  // ---------------------------------------------------------------------
  function toast(msg, isError, sticky) {
    let el = document.getElementById('__tnb_autocopy_toast__');
    if (!el) {
      el = document.createElement('div');
      el.id = '__tnb_autocopy_toast__';
      Object.assign(el.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: '2147483647',
        padding: '14px 20px',
        borderRadius: '8px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        fontWeight: '600',
        color: '#fff',
        boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
        transition: 'opacity 0.3s ease',
        maxWidth: '360px',
        lineHeight: '1.4',
      });
      document.body.appendChild(el);
    }
    el.style.background = isError ? '#dc2626' : '#16a34a';
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el.__timer);
    if (!sticky) {
      el.__timer = setTimeout(() => {
        el.style.opacity = '0';
      }, 5000);
    }
  }

  // ---------------------------------------------------------------------
  // Text selection — identical logic to the working bookmarklet: select
  // the focused textarea/text-input if there is one, otherwise select the
  // whole page body's rendered text.
  // ---------------------------------------------------------------------
  function getPageText() {
    let text;
    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && (active.type === 'text' || active.type === 'search')))) {
      active.select();
      text = active.value;
    } else {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(document.body);
      sel.removeAllRanges();
      sel.addRange(range);
      text = sel.toString();
    }
    return text || '';
  }

  /** Manual-panel copy: grabs the page text and puts it on the OS clipboard. */
  async function copyPageData() {
    toast('⏳ Đang chọn và sao chép dữ liệu, vui lòng đợi...', false, true);
    try {
      const text = getPageText();
      if (!text || text.length === 0) {
        toast('⚠️ Không có dữ liệu nào để copy.', true);
        return false;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else if (!document.execCommand('copy')) {
        throw new Error('Trình duyệt không hỗ trợ copy tự động.');
      }
      toast('✅ Đã copy xong ' + text.length.toLocaleString('vi-VN') + ' ký tự! Chuyển tab và dán (Ctrl+V) vào dự án.', false);
      return true;
    } catch (e) {
      toast('❌ Copy thất bại: ' + e.message, true);
      return false;
    }
  }

  // ---------------------------------------------------------------------
  // Small DOM helpers for driving the site's own "Thống kê theo..." dropdown.
  // Matched by visible TEXT, not by CSS class — classes can change on any
  // deploy of the BI site, exact wording of these two options is far more
  // stable, and this is what a human clicking through the UI would key off.
  // ---------------------------------------------------------------------
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  function findLeavesWithText(text) {
    const all = document.querySelectorAll('div, span, li, button, a, p');
    const out = [];
    for (const el of all) {
      if (el.children.length === 0 && el.textContent.trim() === text && isVisible(el)) out.push(el);
    }
    return out;
  }

  const SCOPE_TINH = 'Thống kê theo khu vực';
  const SCOPE_SIEUTHI = 'Thống kê theo Siêu thị';

  /**
   * Opens the "Thống kê theo..." dropdown and clicks the requested option.
   * Returns false (without throwing) if the dropdown/option couldn't be
   * located — the caller still proceeds to copy whatever is on screen,
   * since a failed scope-switch is safer to surface via the toast/log
   * than to silently copy the wrong table.
   */
  async function ensureScope(desiredText) {
    log('Đang kiểm tra chế độ hiển thị: ' + desiredText);
    const triggerCandidates = findLeavesWithText(SCOPE_TINH).concat(findLeavesWithText(SCOPE_SIEUTHI));
    if (triggerCandidates.length === 0) {
      log('⚠️ Không tìm thấy dropdown "Thống kê theo..." trên trang.');
      return false;
    }
    // Closed dropdown: exactly one visible leaf shows the CURRENT selection.
    if (triggerCandidates.length === 1 && triggerCandidates[0].textContent.trim() === desiredText) {
      log('Đã đúng chế độ "' + desiredText + '", không cần đổi.');
      return true;
    }
    // Click the trigger to open the option panel.
    triggerCandidates[0].click();
    await sleep(400);

    const optionCandidates = findLeavesWithText(desiredText);
    if (optionCandidates.length === 0) {
      log('⚠️ Không tìm thấy tuỳ chọn "' + desiredText + '" trong dropdown sau khi mở.');
      return false;
    }
    // The option-panel entry is typically the last match rendered (portal /
    // overlay appended after the trigger) — prefer it over the trigger label.
    optionCandidates[optionCandidates.length - 1].click();
    log('Đã chọn "' + desiredText + '", đang đợi bảng tải lại...');
    await waitForTableSettled();
    return true;
  }

  /** Polls the visible row count until it stops changing, or times out. */
  async function waitForTableSettled(maxMs = 6000) {
    const countRows = () => document.querySelectorAll('table tr, [role="row"]').length;
    let last = -1;
    let stableTicks = 0;
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const current = countRows();
      if (current === last && current > 0) {
        stableTicks += 1;
        if (stableTicks >= 2) return;
      } else {
        stableTicks = 0;
      }
      last = current;
      await sleep(300);
    }
  }

  // ---------------------------------------------------------------------
  // rt (Realtime=1 / Lũy Kế=2) URL param helpers.
  // ---------------------------------------------------------------------
  function getRt() {
    return new URLSearchParams(location.search).get('rt');
  }
  function urlWithRt(rt) {
    const url = new URL(location.href);
    url.searchParams.set('rt', rt);
    return url.toString();
  }

  // ---------------------------------------------------------------------
  // The 4 capture jobs. `label` matches what the panel button shows;
  // `target` is what the user pastes it into, shown as a reminder.
  // ---------------------------------------------------------------------
  const JOBS = {
    rt1_tinh: { rt: '1', scope: SCOPE_TINH, label: 'Realtime — Tỉnh', target: 'Thi Đua Tỉnh' },
    rt1_sieuthi: { rt: '1', scope: SCOPE_SIEUTHI, label: 'Realtime — Siêu Thị', target: 'Thi Đua Siêu Thị' },
    rt2_tinh: { rt: '2', scope: SCOPE_TINH, label: 'Lũy Kế — Tỉnh', target: 'Thi Đua Tỉnh' },
    rt2_sieuthi: { rt: '2', scope: SCOPE_SIEUTHI, label: 'Lũy Kế — Siêu Thị', target: 'Thi Đua Siêu Thị' },
  };
  const PENDING_KEY = 'tnb_autocopy_pending';

  async function runJob(jobKey) {
    const job = JOBS[jobKey];
    if (getRt() !== job.rt) {
      // Need a full reload to flip rt= — stash the job and resume on load.
      storeSet(PENDING_KEY, jobKey);
      toast('🔄 Đang chuyển sang chế độ ' + (job.rt === '1' ? 'Realtime' : 'Lũy Kế') + '...', false, true);
      location.href = urlWithRt(job.rt);
      return;
    }
    await ensureScope(job.scope);
    await copyPageData();
    storeClear(PENDING_KEY);
  }

  async function resumePendingJob() {
    const jobKey = storeGet(PENDING_KEY);
    if (!jobKey || !JOBS[jobKey]) return;
    const job = JOBS[jobKey];
    if (getRt() !== job.rt) return; // shouldn't happen, defensive
    log('Tiếp tục job đang chờ sau khi tải lại trang: ' + job.label);
    await sleep(800); // let the page's own data finish its first render
    await ensureScope(job.scope);
    await copyPageData();
    storeClear(PENDING_KEY);
  }

  // ---------------------------------------------------------------------
  // AutoCopy mode — driven entirely by the TNB app via window.open(), no
  // button clicks needed. Reads `__tnb_autocopy=1` + `__tnb_origin=<encoded
  // app origin>` off the URL (set by the app), auto-captures BOTH Tỉnh and
  // Siêu Thị for whichever `rt` the app opened us with, and posts each
  // dataset back via window.opener.postMessage. Message contract:
  //   { type: 'TNB_BI_AUTOCOPY_DATA',  rt, scope: 'tinh'|'sieuthi', text }
  //   { type: 'TNB_BI_AUTOCOPY_DONE',  rt }
  //   { type: 'TNB_BI_AUTOCOPY_ERROR', rt, message }
  // ---------------------------------------------------------------------
  function getAutoCopyParams() {
    const params = new URLSearchParams(location.search);
    const raw = params.get('__tnb_origin');
    return {
      enabled: params.get('__tnb_autocopy') === '1',
      targetOrigin: raw ? decodeURIComponent(raw) : null,
    };
  }

  async function runAutoCopySequence() {
    const { targetOrigin } = getAutoCopyParams();
    const rt = getRt();
    if (!targetOrigin || !window.opener) {
      log('⚠️ Thiếu __tnb_origin hoặc không có window.opener — không thể gửi dữ liệu về ứng dụng.');
      return;
    }
    const send = (payload) => {
      try {
        window.opener.postMessage(Object.assign({ rt }, payload), targetOrigin);
      } catch (e) {
        log('⚠️ postMessage lỗi: ' + e.message);
      }
    };

    try {
      log('🤖 Chế độ AutoCopy — rt=' + rt + '. Đang đợi bảng tải lần đầu...');
      await sleep(1000);
      await waitForTableSettled();

      log('Đang lấy dữ liệu Tỉnh...');
      await ensureScope(SCOPE_TINH);
      const tinhText = getPageText();
      if (!tinhText) throw new Error('Không lấy được dữ liệu Tỉnh (bảng rỗng?).');
      send({ type: 'TNB_BI_AUTOCOPY_DATA', scope: 'tinh', text: tinhText });
      log('✅ Đã gửi dữ liệu Tỉnh (' + tinhText.length.toLocaleString('vi-VN') + ' ký tự).');

      log('Đang chuyển sang Siêu Thị...');
      await ensureScope(SCOPE_SIEUTHI);
      const sieuthiText = getPageText();
      if (!sieuthiText) throw new Error('Không lấy được dữ liệu Siêu Thị (bảng rỗng?).');
      send({ type: 'TNB_BI_AUTOCOPY_DATA', scope: 'sieuthi', text: sieuthiText });
      log('✅ Đã gửi dữ liệu Siêu Thị (' + sieuthiText.length.toLocaleString('vi-VN') + ' ký tự).');

      send({ type: 'TNB_BI_AUTOCOPY_DONE' });
      log('🎉 Hoàn tất! Cửa sổ sẽ tự đóng sau giây lát...');
      await sleep(1200);
      window.close();
    } catch (e) {
      log('❌ Lỗi: ' + e.message);
      send({ type: 'TNB_BI_AUTOCOPY_ERROR', message: e.message });
    }
  }

  // ---------------------------------------------------------------------
  // Floating control panel + mini log, so progress is visible without
  // opening devtools.
  // ---------------------------------------------------------------------
  let logEl;
  function log(msg) {
    console.log('[TNB AutoCopy]', msg);
    if (!logEl) return;
    const line = document.createElement('div');
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    while (logEl.children.length > 30) logEl.removeChild(logEl.firstChild);
  }

  function buildPanel(minimal) {
    if (document.getElementById('__tnb_autocopy_panel__')) return;
    const panel = document.createElement('div');
    panel.id = '__tnb_autocopy_panel__';
    Object.assign(panel.style, {
      position: 'fixed',
      top: '70px',
      right: '20px',
      zIndex: '2147483000',
      width: '260px',
      background: '#ffffff',
      border: '1px solid #d1d5db',
      borderRadius: '10px',
      boxShadow: '0 6px 20px rgba(0,0,0,0.18)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '13px',
      overflow: 'hidden',
    });

    const header = document.createElement('div');
    header.textContent = minimal ? '🤖 TNB AutoCopy — đang chạy tự động' : '📋 TNB Auto Copy';
    Object.assign(header.style, {
      background: '#1e293b',
      color: '#fff',
      fontWeight: '700',
      padding: '8px 12px',
      cursor: 'move',
    });
    panel.appendChild(header);

    const body = document.createElement('div');
    body.style.padding = '10px';
    panel.appendChild(body);

    if (!minimal) {
      Object.entries(JOBS).forEach(([key, job]) => {
        const btn = document.createElement('button');
        btn.textContent = job.label;
        btn.title = 'Dán vào ô: ' + job.target;
        Object.assign(btn.style, {
          display: 'block',
          width: '100%',
          marginBottom: '6px',
          padding: '8px 10px',
          border: '1px solid #cbd5e1',
          borderRadius: '6px',
          background: '#f8fafc',
          color: '#0f172a',
          fontWeight: '600',
          cursor: 'pointer',
          textAlign: 'left',
        });
        btn.addEventListener('mouseenter', () => (btn.style.background = '#e2e8f0'));
        btn.addEventListener('mouseleave', () => (btn.style.background = '#f8fafc'));
        btn.addEventListener('click', () => {
          log('▶ ' + job.label + ' → dán vào "' + job.target + '"');
          runJob(key);
        });
        body.appendChild(btn);
      });

      const hint = document.createElement('div');
      hint.textContent = 'Sau khi copy, chuyển sang tab dự án và dán (Ctrl+V) vào đúng ô trước khi bấm nút tiếp theo.';
      Object.assign(hint.style, { color: '#64748b', fontSize: '11px', margin: '4px 0 8px', lineHeight: '1.4' });
      body.appendChild(hint);
    }

    logEl = document.createElement('div');
    Object.assign(logEl.style, {
      maxHeight: '110px',
      overflowY: 'auto',
      background: '#f1f5f9',
      border: '1px solid #e2e8f0',
      borderRadius: '6px',
      padding: '6px 8px',
      color: '#334155',
      fontSize: '11px',
      lineHeight: '1.5',
    });
    body.appendChild(logEl);

    document.body.appendChild(panel);

    // Simple drag-to-move on the header.
    let dragging = false, dx = 0, dy = 0;
    header.addEventListener('mousedown', (e) => {
      dragging = true;
      dx = e.clientX - panel.getBoundingClientRect().left;
      dy = e.clientY - panel.getBoundingClientRect().top;
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = e.clientX - dx + 'px';
      panel.style.top = e.clientY - dy + 'px';
      panel.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => (dragging = false));
  }

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  function init() {
    const { enabled } = getAutoCopyParams();
    if (enabled) {
      buildPanel(true);
      log('rt hiện tại = ' + (getRt() || '(không có)'));
      runAutoCopySequence();
      return;
    }
    buildPanel(false);
    log('Sẵn sàng. rt hiện tại = ' + (getRt() || '(không có)'));
    resumePendingJob();
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 500);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 500));
  }
})();
