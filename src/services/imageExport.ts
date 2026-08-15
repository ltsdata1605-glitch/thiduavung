/**
 * Element-to-PNG export, ported (and trimmed down) from a sister project's
 * proven implementation. The two pitfalls that make a naive html-to-image
 * call fail on this stack:
 *  1. Tailwind v4's default palette is oklch() — html-to-image/html2canvas
 *     can't rasterize it, so colors render black/missing unless resolved to
 *     rgb() first (fixOklchColors below).
 *  2. The report table scrolls horizontally with frozen (sticky) columns —
 *     a naive capture only grabs whatever's currently scrolled into view.
 *     The clone's scrollable containers are expanded to full content size
 *     before capture so every column ends up in the image.
 */

import { formatStoreDisplayName } from '../utils/parser';

/**
 * Resolve oklch()/color-mix() computed colors to rgb() so the exported PNG
 * doesn't render them as black. Walks EVERY element under root — for the
 * Siêu Thị full-table export (700+ rows × ~45 columns, tens of thousands of
 * DOM nodes once every cell's inner spans/badges are counted), doing that
 * as one giant synchronous getComputedStyle loop blocks the main thread
 * long enough for mobile Safari/Chrome's "page unresponsive" watchdog to
 * kill the tab outright — the most likely cause of the export "bị văng ra"
 * (crashing/kicking the user out) specifically on large mobile exports.
 * Processed in yielding batches instead so the browser stays responsive
 * throughout, even though the total work is the same.
 */
async function fixOklchColors(root: HTMLElement): Promise<void> {
  const cvs = document.createElement('canvas');
  cvs.width = 1;
  cvs.height = 1;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  function resolveOklch(val: string): string | null {
    if (!val || val.indexOf('oklch') === -1) return null;
    try {
      // Distinct sentinel (not black) — if the assignment silently fails to
      // parse, fillStyle stays at the sentinel and we know to leave the
      // original color alone instead of misreading "unparsed" as "black".
      const SENTINEL = '#ff00fe';
      ctx!.clearRect(0, 0, 1, 1);
      ctx!.fillStyle = SENTINEL;
      ctx!.fillStyle = val;
      if (ctx!.fillStyle === SENTINEL) return null;

      ctx!.fillRect(0, 0, 1, 1);
      const px = ctx!.getImageData(0, 0, 1, 1).data;
      if (px[3] > 0) {
        return `rgba(${px[0]},${px[1]},${px[2]},${(px[3] / 255).toFixed(2)})`;
      }
      return ctx!.fillStyle;
    } catch (e) {
      return null;
    }
  }

  const colorProps: [keyof CSSStyleDeclaration, string][] = [
    ['color', 'color'],
    ['backgroundColor', 'background-color'],
    ['borderColor', 'border-color'],
    ['borderTopColor', 'border-top-color'],
    ['borderRightColor', 'border-right-color'],
    ['borderBottomColor', 'border-bottom-color'],
    ['borderLeftColor', 'border-left-color'],
    ['outlineColor', 'outline-color'],
  ];

  const els = [root, ...Array.from(root.querySelectorAll('*'))];
  // Small enough to keep each batch's blocking time low on a mobile CPU,
  // large enough that a 700-row table (tens of thousands of nodes) still
  // finishes in a reasonable number of yields rather than thousands of them.
  const BATCH_SIZE = 400;
  for (let i = 0; i < els.length; i += BATCH_SIZE) {
    const batch = els.slice(i, i + BATCH_SIZE);
    for (const el of batch) {
      if (!(el instanceof HTMLElement)) continue;
      try {
        const cs = window.getComputedStyle(el);
        for (const [jsProp, cssProp] of colorProps) {
          const val = cs[jsProp] as unknown as string;
          if (val && typeof val === 'string' && val.indexOf('oklch') !== -1) {
            const rgb = resolveOklch(val);
            if (rgb) el.style.setProperty(cssProp, rgb, 'important');
          }
        }
        const shadow = cs.boxShadow;
        if (shadow && shadow.indexOf('oklch') !== -1) {
          const fixed = shadow.replace(/oklch\([^)]+\)/g, (m) => resolveOklch(m) || 'transparent');
          el.style.setProperty('box-shadow', fixed, 'important');
        }
      } catch (e) {
        // ignore elements getComputedStyle can't handle
      }
    }
    // Yield back to the browser between batches so a long export never
    // reads as a single unresponsive blocking script.
    if (i + BATCH_SIZE < els.length) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

function waitForImages(element: HTMLElement): Promise<void[]> {
  const images = Array.from(element.querySelectorAll('img'));
  return Promise.all(
    images.map((img) => {
      if (img.complete && img.naturalHeight !== 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 1500);
        img.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        img.onerror = () => {
          clearTimeout(timer);
          resolve();
        };
      });
    })
  );
}

const isMobileUserAgent = () =>
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;

/** True if the browser can share files via the native OS share sheet (Web Share API Level 2). */
function canShareFiles(): boolean {
  if (!navigator.share || !navigator.canShare) return false;
  try {
    const testFile = new File(['test'], 'test.png', { type: 'image/png' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/** Open the native OS share sheet (Zalo, Messenger, Line, Teams, Save to Photos, AirDrop, ...) for a PNG blob. */
async function shareBlob(blob: Blob, filename: string): Promise<boolean> {
  try {
    const file = new File([blob], filename, { type: 'image/png' });
    // IMPORTANT: Only pass files without title or text so messaging apps (Line, Zalo, Teams) ONLY send the pure image file!
    const shareData: ShareData = { files: [file] };

    if (navigator.canShare && navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return true;
    }
    downloadBlob(blob, filename, true);
    return false;
  } catch (error) {
    if (isAbortError(error)) return false; // user cancelled the share sheet — not a failure
    console.error('Lỗi khi chia sẻ ảnh:', error);
    downloadBlob(blob, filename, true);
    return false;
  }
}

/**
 * Hand a Blob off to the user: on mobile, open the native OS share sheet
 * (so it can go straight to Line/Zalo/Messenger/Save to Photos) with pure image.
 * If remarkTextToCopy is provided, automatically copy that remark to clipboard.
 */
export function downloadBlob(blob: Blob, filename: string, forceDownload = false, remarkTextToCopy?: string) {
  if (remarkTextToCopy) {
    try {
      void navigator.clipboard.writeText(remarkTextToCopy);
    } catch (e) {
      console.warn('Could not copy remark to clipboard', e);
    }
  }

  if (!forceDownload && isMobileUserAgent() && canShareFiles()) {
    void shareBlob(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export interface ExportElementOptions {
  /** CSS selectors to strip from the clone entirely (buttons, filter bars, etc). */
  elementsToHide?: string[];
  /** Export scale multiplier — higher = sharper but heavier. */
  scale?: number;
  /** Remark text to automatically copy to clipboard on export */
  remarkTextToCopy?: string;
}

/** Suppress all scrollbars in a DOM subtree so no scrollbar thumbs appear in PNG. */
function suppressScrollbars(container: HTMLElement) {
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; background: transparent !important; }
    * { scrollbar-width: none !important; -ms-overflow-style: none !important; }
  `;
  container.appendChild(styleEl);

  const els = [container, ...Array.from(container.querySelectorAll<HTMLElement>('*'))];
  els.forEach((el) => {
    el.style.setProperty('scrollbar-width', 'none', 'important');
    el.style.setProperty('-ms-overflow-style', 'none', 'important');
    if (el.classList.contains('overflow-x-auto') || el.classList.contains('overflow-y-auto') || el.classList.contains('overflow-auto')) {
      el.style.setProperty('overflow', 'visible', 'important');
      el.style.setProperty('max-height', 'none', 'important');
      el.style.setProperty('height', 'auto', 'important');
    }
  });
}

/**
 * Compute the highest possible pixelRatio/scale that will not exceed mobile/browser
 * GPU texture limits (which otherwise turns the canvas 100% pitch black on iOS/Android).
 */
function computeSafeScale(targetWidth: number, targetHeight: number, requestedScale: number = 2.5): number {
  const isMobile =
    typeof navigator !== 'undefined' &&
    (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.innerWidth < 768));

  // Mobile WebKit / Safari limits: 4096px max dimension or ~12.5 Megapixels total area.
  // Desktop browsers support up to 14000px and 64 Megapixels.
  const maxDim = isMobile ? 4096 : 14000;
  const maxArea = isMobile ? 12 * 1024 * 1024 : 64 * 1024 * 1024;

  let safeScale = requestedScale;

  // 1. Cap by max width
  if (targetWidth * safeScale > maxDim) {
    safeScale = Math.min(safeScale, maxDim / targetWidth);
  }

  // 2. Cap by max height
  if (targetHeight * safeScale > maxDim) {
    safeScale = Math.min(safeScale, maxDim / targetHeight);
  }

  // 3. Cap by total pixel buffer area
  const projectedArea = targetWidth * safeScale * (targetHeight * safeScale);
  if (projectedArea > maxArea) {
    const areaScale = Math.sqrt(maxArea / (targetWidth * targetHeight));
    safeScale = Math.min(safeScale, areaScale);
  }

  // Never drop below 0.75, round to 2 decimal places
  return Math.max(0.75, Math.round(safeScale * 100) / 100);
}

/**
 * Clone `element`, fix everything that would otherwise render wrong/missing
 * in the export (oklch colors, scrolled-out table columns, Recharts SVGs, scrollbars),
 * then rasterize it to a PNG Blob via html-to-image.
 */
export async function exportElementAsImage(
  element: HTMLElement,
  filename: string,
  options: ExportElementOptions = {}
): Promise<Blob | null> {
  const { elementsToHide = ['.export-hide'], scale = 2.5 } = options;

  const scrollContainer = element.querySelector<HTMLElement>('.overflow-x-auto');
  const tableEl = element.querySelector<HTMLElement>('table');
  const liveTableWidth = tableEl ? Math.ceil(Math.max(tableEl.scrollWidth, tableEl.offsetWidth, tableEl.getBoundingClientRect().width)) : 0;
  const liveScrollWidth = scrollContainer ? Math.ceil(Math.max(scrollContainer.scrollWidth, scrollContainer.offsetWidth)) : 0;
  const isMultiColumnTable = (scrollContainer && scrollContainer.scrollWidth > scrollContainer.clientWidth + 20) || (liveTableWidth > 800);

  const clone = element.cloneNode(true) as HTMLElement;

  // Remove control bars and camera export buttons
  elementsToHide.forEach((selector) => {
    clone.querySelectorAll<HTMLElement>(selector).forEach((el) => el.remove());
  });

  // Unhide elements meant specifically for export
  clone.querySelectorAll<HTMLElement>('.export-show').forEach((el) => {
    el.style.setProperty('display', 'inline-flex', 'important');
  });

  // Display full store names in all exported images (except comparison mode which formats itself)
  clone.querySelectorAll<HTMLElement>('[data-store-name], .store-name-cell').forEach((el) => {
    const raw = el.getAttribute('data-store-name') || el.textContent || '';
    if (raw) {
      el.textContent = formatStoreDisplayName(raw);
    }
  });

  // Strip all scrollbars & expand inner containers
  suppressScrollbars(clone);

  // Compact table cells padding
  clone.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
    cell.style.setProperty('padding-left', '6px', 'important');
    cell.style.setProperty('padding-right', '6px', 'important');
    cell.style.setProperty('white-space', 'nowrap', 'important');
  });

  // Expand scrollable containers to show ALL content (no clipping)
  clone.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-y-auto, [class*="max-h-"]').forEach((container) => {
    container.style.setProperty('overflow', 'visible', 'important');
    container.style.setProperty('max-height', 'none', 'important');
    container.style.setProperty('height', 'auto', 'important');
    container.style.setProperty('width', 'max-content', 'important');
    container.style.setProperty('max-width', 'none', 'important');
  });

  clone.querySelectorAll<HTMLElement>('table').forEach((table) => {
    table.style.setProperty('width', 'max-content', 'important');
    table.style.setProperty('min-width', 'auto', 'important');
    table.style.setProperty('max-width', 'none', 'important');
    table.style.setProperty('table-layout', 'auto', 'important');
  });

  // Set clone dimensions to fit content
  clone.style.setProperty('width', 'max-content', 'important');
  clone.style.setProperty('min-width', 'auto', 'important');
  clone.style.setProperty('max-width', 'none', 'important');
  clone.style.setProperty('height', 'auto', 'important');
  clone.style.setProperty('min-height', 'auto', 'important');
  clone.style.setProperty('max-height', 'none', 'important');
  clone.style.setProperty('display', 'block', 'important');
  clone.style.setProperty('box-sizing', 'border-box', 'important');
  clone.style.setProperty('background-color', '#ffffff', 'important');

  // Sticky columns only need to stay pinned during live scrolling — flatten
  // them so they render in normal flow in the exported image
  clone.querySelectorAll<HTMLElement>('.sticky').forEach((el) => {
    el.style.setProperty('position', 'static', 'important');
    el.style.setProperty('left', 'auto', 'important');
    el.style.setProperty('top', 'auto', 'important');
  });

  // Convert Recharts SVGs to inline <img> if present
  const liveRechartsSvgs = element.querySelectorAll('svg.recharts-surface');
  const cloneRechartsSvgs = clone.querySelectorAll('svg.recharts-surface');
  cloneRechartsSvgs.forEach((cloneSvg, idx) => {
    const sourceSvg = liveRechartsSvgs[idx] || cloneSvg;
    const w = parseFloat(sourceSvg.getAttribute('width') || '0');
    const h = parseFloat(sourceSvg.getAttribute('height') || '0');
    if (w <= 0 || h <= 0) return;
    try {
      const svgClone = sourceSvg.cloneNode(true) as SVGElement;
      svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      if (!svgClone.hasAttribute('viewBox')) svgClone.setAttribute('viewBox', `0 0 ${w} ${h}`);
      const svgData = new XMLSerializer().serializeToString(svgClone);
      const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.width = `${w}px`;
      img.style.height = `${h}px`;
      img.style.display = 'block';
      cloneSvg.parentElement?.replaceChild(img, cloneSvg);
    } catch (e) {
      console.warn('Failed to convert Recharts SVG to image:', e);
    }
  });

  // Use fixed offscreen container with opacity 0 at origin to guarantee GPU/WebKit layout
  const captureContainer = document.createElement('div');
  captureContainer.style.position = 'fixed';
  captureContainer.style.left = '0';
  captureContainer.style.top = '0';
  captureContainer.style.zIndex = '-9999';
  captureContainer.style.opacity = '0';
  captureContainer.style.pointerEvents = 'none';
  captureContainer.style.width = 'max-content';
  captureContainer.style.maxWidth = 'none';
  captureContainer.style.display = 'block';
  captureContainer.style.backgroundColor = '#ffffff';
  captureContainer.appendChild(clone);
  document.body.appendChild(captureContainer);

  try {
    await document.fonts.ready;
    await waitForImages(clone);
    await fixOklchColors(clone);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Re-measure after DOM attachment
    const tableInClone = clone.querySelector('table');
    const actualTableWidth = tableInClone ? Math.ceil(Math.max(tableInClone.scrollWidth, tableInClone.offsetWidth, tableInClone.getBoundingClientRect().width)) : 0;
    
    // Account for card padding/borders so the rightmost table column is never clipped
    const computedStyle = window.getComputedStyle(clone);
    const padLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const padRight = parseFloat(computedStyle.paddingRight) || 0;
    const totalRequiredWidth = (actualTableWidth > 0 ? actualTableWidth : liveTableWidth) + padLeft + padRight + 20;

    let finalWidth = Math.ceil(Math.max(totalRequiredWidth, 360));
    if (isMultiColumnTable) {
      finalWidth = Math.max(finalWidth, liveTableWidth + 24, liveScrollWidth + 24);
    }

    // Apply exact width to clone, captureContainer and all full-width headers (outside tables)
    clone.style.setProperty('width', `${finalWidth}px`, 'important');
    clone.style.setProperty('min-width', `${finalWidth}px`, 'important');
    clone.style.setProperty('max-width', `${finalWidth}px`, 'important');
    captureContainer.style.setProperty('width', `${finalWidth}px`, 'important');
    captureContainer.style.setProperty('min-width', `${finalWidth}px`, 'important');
    captureContainer.style.setProperty('max-width', `${finalWidth}px`, 'important');

    clone.querySelectorAll<HTMLElement>('div, section, header, [id*="root"]').forEach((div) => {
      if (div.closest('table')) return; // Never resize elements inside tables
      if (div.classList.contains('w-full') || div.style.width === '100%') {
        div.style.setProperty('width', '100%', 'important');
        div.style.setProperty('max-width', '100%', 'important');
        div.style.setProperty('box-sizing', 'border-box', 'important');
      }
    });

    if (tableInClone) {
      tableInClone.style.setProperty('width', '100%', 'important');
      tableInClone.style.setProperty('max-width', '100%', 'important');
      tableInClone.style.setProperty('box-sizing', 'border-box', 'important');
    }

    // Calculate exact content height reliably
    const cloneScrollHeight = Math.ceil(clone.scrollHeight);
    const cloneOffsetHeight = Math.ceil(clone.offsetHeight);
    const cloneBoundingHeight = Math.ceil(clone.getBoundingClientRect().height);
    const height = Math.max(cloneScrollHeight, cloneOffsetHeight, cloneBoundingHeight, 350) + 4;

    const finalScale = computeSafeScale(finalWidth, height, scale);

    const htmlToImage = await import('html-to-image');
    const blob = await htmlToImage.toBlob(clone, {
      pixelRatio: finalScale,
      backgroundColor: '#ffffff',
      width: finalWidth,
      height,
    });

    if (!blob) throw new Error('html-to-image trả về rỗng.');
    downloadBlob(blob, filename, false, options.remarkTextToCopy);
    return blob;
  } catch (error) {
    console.error(`Lỗi khi xuất ảnh "${filename}":`, error);
    return null;
  } finally {
    document.body.removeChild(captureContainer);
  }
}

/**
 * Export a specific group (ict, dichvu, ce) or all groups from the report element.
 * Strips out unused group columns when exporting individual groups to guarantee
 * exact width fit without horizontal stretching or empty gaps.
 */
export async function exportGroupSpecificElement(
  element: HTMLElement,
  groupKey: 'ict' | 'dichvu' | 'ce' | 'all' | 'quick',
  filename: string,
  options: ExportElementOptions = {}
): Promise<Blob | null> {
  const { elementsToHide = ['.export-hide'], scale = 2.5 } = options;

  const clone = element.cloneNode(true) as HTMLElement;

  elementsToHide.forEach((selector) => {
    clone.querySelectorAll<HTMLElement>(selector).forEach((el) => el.remove());
  });

  // Unhide elements meant specifically for export
  clone.querySelectorAll<HTMLElement>('.export-show').forEach((el) => {
    el.style.setProperty('display', 'inline-flex', 'important');
  });

  // Display full store names in exported image (except comparison mode which formats itself)
  clone.querySelectorAll<HTMLElement>('[data-store-name], .store-name-cell').forEach((el) => {
    const raw = el.getAttribute('data-store-name') || el.textContent || '';
    if (raw) {
      el.textContent = formatStoreDisplayName(raw);
    }
  });

  // Strip all scrollbars from clone DOM
  suppressScrollbars(clone);

  // Filter columns by data-group attribute if targeting a single group or quick export
  if (groupKey === 'quick') {
    // Xuất nhanh: Xóa toàn bộ các cột ngành hàng, chỉ giữ lại các cột cơ bản (STT -> Tỷ lệ %)
    clone.querySelectorAll<HTMLElement>('[data-group]').forEach((el) => el.remove());
    // Xóa hàng header phụ rỗng nếu có và bỏ rowspan ở header chính
    clone.querySelectorAll<HTMLElement>('thead tr').forEach((tr) => {
      if (tr.children.length === 0) {
        tr.remove();
      }
    });
    clone.querySelectorAll<HTMLElement>('th[rowspan]').forEach((th) => {
      th.removeAttribute('rowspan');
    });

    const headerThs = Array.from(clone.querySelectorAll<HTMLElement>('thead tr:first-child th'));
    const isProvinceQuick = headerThs.length <= 4; // Tab Vùng (STT, Tỉnh, Đạt, Tỷ lệ %)

    // Remove existing colgroups
    clone.querySelectorAll('colgroup').forEach((cg) => cg.remove());

    if (isProvinceQuick) {
      // Tab Vùng: STT(50px), Tỉnh(160px), Đạt(80px), Tỷ lệ %(85px) => Total 375px
      const colWidths = [50, 160, 80, 85];
      const tableTotalWidth = colWidths.reduce((a, b) => a + b, 0);

      clone.querySelectorAll<HTMLElement>('table').forEach((table) => {
        table.style.setProperty('width', `${tableTotalWidth}px`, 'important');
        table.style.setProperty('min-width', `${tableTotalWidth}px`, 'important');
        table.style.setProperty('max-width', `${tableTotalWidth}px`, 'important');
        table.style.setProperty('table-layout', 'fixed', 'important');
      });

      clone.querySelectorAll<HTMLElement>('thead tr').forEach((tr) => {
        const ths = Array.from(tr.children) as HTMLElement[];
        ths.forEach((th, idx) => {
          const w = colWidths[idx] || 80;
          th.style.setProperty('width', `${w}px`, 'important');
          th.style.setProperty('min-width', `${w}px`, 'important');
          th.style.setProperty('max-width', `${w}px`, 'important');
          th.style.setProperty('box-sizing', 'border-box', 'important');
          th.style.setProperty('text-align', idx === 1 ? 'left' : 'center', 'important');
          th.style.setProperty('padding-left', idx === 1 ? '12px' : '6px', 'important');
          th.style.setProperty('padding-right', '6px', 'important');
        });
      });

      clone.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => {
        const tds = Array.from(tr.children) as HTMLElement[];
        tds.forEach((td, idx) => {
          const w = colWidths[idx] || 80;
          td.style.setProperty('width', `${w}px`, 'important');
          td.style.setProperty('min-width', `${w}px`, 'important');
          td.style.setProperty('max-width', `${w}px`, 'important');
          td.style.setProperty('box-sizing', 'border-box', 'important');
          td.style.setProperty('text-align', idx === 1 ? 'left' : 'center', 'important');
          td.style.setProperty('padding-left', idx === 1 ? '12px' : '6px', 'important');
          td.style.setProperty('padding-right', '6px', 'important');
          td.style.setProperty('white-space', 'nowrap', 'important');
        });
      });

      // Tfoot: Total row
      clone.querySelectorAll<HTMLElement>('tfoot tr').forEach((tr) => {
        const tds = Array.from(tr.children) as HTMLElement[];
        if (tds.length === 3) {
          // td[0] has colSpan 2 (STT + Tỉnh) => width = 50 + 160 = 210px
          const spanW = colWidths[0] + colWidths[1];
          tds[0].style.setProperty('width', `${spanW}px`, 'important');
          tds[0].style.setProperty('min-width', `${spanW}px`, 'important');
          tds[0].style.setProperty('max-width', `${spanW}px`, 'important');
          tds[0].style.setProperty('box-sizing', 'border-box', 'important');
          tds[0].style.setProperty('text-align', 'center', 'important');

          tds[1].style.setProperty('width', `${colWidths[2]}px`, 'important');
          tds[1].style.setProperty('min-width', `${colWidths[2]}px`, 'important');
          tds[1].style.setProperty('max-width', `${colWidths[2]}px`, 'important');
          tds[1].style.setProperty('box-sizing', 'border-box', 'important');
          tds[1].style.setProperty('text-align', 'center', 'important');

          tds[2].style.setProperty('width', `${colWidths[3]}px`, 'important');
          tds[2].style.setProperty('min-width', `${colWidths[3]}px`, 'important');
          tds[2].style.setProperty('max-width', `${colWidths[3]}px`, 'important');
          tds[2].style.setProperty('box-sizing', 'border-box', 'important');
          tds[2].style.setProperty('text-align', 'center', 'important');
        }
      });
    } else {
      // Tab Siêu Thị: STT(45px), Tỉnh(85px), Boss(85px), Kênh(65px), Siêu thị(290px), Đạt(75px), Tỷ lệ %(80px) => Total 725px
      const colWidths = [45, 85, 85, 65, 290, 75, 80];
      const tableTotalWidth = colWidths.reduce((a, b) => a + b, 0);

      clone.querySelectorAll<HTMLElement>('table').forEach((table) => {
        table.style.setProperty('width', `${tableTotalWidth}px`, 'important');
        table.style.setProperty('min-width', `${tableTotalWidth}px`, 'important');
        table.style.setProperty('max-width', `${tableTotalWidth}px`, 'important');
        table.style.setProperty('table-layout', 'fixed', 'important');
      });

      clone.querySelectorAll<HTMLElement>('thead tr').forEach((tr) => {
        const ths = Array.from(tr.children) as HTMLElement[];
        ths.forEach((th, idx) => {
          const w = colWidths[idx] || 80;
          th.style.setProperty('width', `${w}px`, 'important');
          th.style.setProperty('min-width', `${w}px`, 'important');
          th.style.setProperty('max-width', `${w}px`, 'important');
          th.style.setProperty('box-sizing', 'border-box', 'important');
          th.style.setProperty('text-align', idx === 1 || idx === 4 ? 'left' : 'center', 'important');
          th.style.setProperty('padding-left', idx === 1 || idx === 4 ? '10px' : '6px', 'important');
          th.style.setProperty('padding-right', '6px', 'important');
        });
      });

      clone.querySelectorAll<HTMLElement>('tbody tr').forEach((tr) => {
        const tds = Array.from(tr.children) as HTMLElement[];
        tds.forEach((td, idx) => {
          const w = colWidths[idx] || 80;
          td.style.setProperty('width', `${w}px`, 'important');
          td.style.setProperty('min-width', `${w}px`, 'important');
          td.style.setProperty('max-width', `${w}px`, 'important');
          td.style.setProperty('box-sizing', 'border-box', 'important');
          td.style.setProperty('text-align', idx === 1 || idx === 4 ? 'left' : 'center', 'important');
          td.style.setProperty('padding-left', idx === 1 || idx === 4 ? '10px' : '6px', 'important');
          td.style.setProperty('padding-right', '6px', 'important');
          td.style.setProperty('white-space', 'nowrap', 'important');
        });
      });

      // Tfoot: Total row
      clone.querySelectorAll<HTMLElement>('tfoot tr').forEach((tr) => {
        const tds = Array.from(tr.children) as HTMLElement[];
        if (tds.length === 3) {
          // td[0] has colSpan 5 (STT + Tỉnh + Boss + Kênh + Siêu thị) => 45 + 85 + 85 + 65 + 290 = 570px
          const spanW = colWidths.slice(0, 5).reduce((a, b) => a + b, 0);
          tds[0].style.setProperty('width', `${spanW}px`, 'important');
          tds[0].style.setProperty('min-width', `${spanW}px`, 'important');
          tds[0].style.setProperty('max-width', `${spanW}px`, 'important');
          tds[0].style.setProperty('box-sizing', 'border-box', 'important');
          tds[0].style.setProperty('text-align', 'center', 'important');

          tds[1].style.setProperty('width', `${colWidths[5]}px`, 'important');
          tds[1].style.setProperty('min-width', `${colWidths[5]}px`, 'important');
          tds[1].style.setProperty('max-width', `${colWidths[5]}px`, 'important');
          tds[1].style.setProperty('box-sizing', 'border-box', 'important');
          tds[1].style.setProperty('text-align', 'center', 'important');

          tds[2].style.setProperty('width', `${colWidths[6]}px`, 'important');
          tds[2].style.setProperty('min-width', `${colWidths[6]}px`, 'important');
          tds[2].style.setProperty('max-width', `${colWidths[6]}px`, 'important');
          tds[2].style.setProperty('box-sizing', 'border-box', 'important');
          tds[2].style.setProperty('text-align', 'center', 'important');
        }
      });
    }
  } else {
    // Other group exports or full matrix
    if (groupKey !== 'all') {
      clone.querySelectorAll<HTMLElement>('[data-group]').forEach((el) => {
        const elGroup = el.getAttribute('data-group');
        if (elGroup && elGroup !== groupKey) {
          el.remove();
        }
      });
    }

    clone.querySelectorAll('colgroup').forEach((cg) => cg.remove());
    clone.querySelectorAll<HTMLElement>('table').forEach((table) => {
      table.style.setProperty('width', 'max-content', 'important');
      table.style.setProperty('table-layout', 'auto', 'important');
    });

    clone.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
      cell.style.setProperty('white-space', 'nowrap', 'important');
      cell.style.setProperty('padding-left', '8px', 'important');
      cell.style.setProperty('padding-right', '8px', 'important');
      cell.style.setProperty('width', 'auto', 'important');
      cell.style.setProperty('max-width', 'none', 'important');
      cell.style.setProperty('min-width', 'auto', 'important');
    });
  }

  // Allow inner containers to expand naturally to fit group columns
  clone.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-y-auto, [class*="max-h-"]').forEach((container) => {
    container.style.setProperty('overflow', 'visible', 'important');
    container.style.setProperty('max-height', 'none', 'important');
    container.style.setProperty('height', 'auto', 'important');
    container.style.setProperty('max-width', 'none', 'important');
    container.style.setProperty('width', 'max-content', 'important');
  });

  clone.querySelectorAll<HTMLElement>('[class*="max-w-"]').forEach((el) => {
    el.style.setProperty('max-width', 'none', 'important');
    el.style.setProperty('width', 'auto', 'important');
  });

  clone.querySelectorAll<HTMLElement>('.sticky').forEach((el) => {
    el.style.setProperty('position', 'static', 'important');
    el.style.setProperty('left', 'auto', 'important');
    el.style.setProperty('top', 'auto', 'important');
  });

  // Use fixed offscreen container with opacity 0 at origin to guarantee GPU/WebKit layout
  const captureContainer = document.createElement('div');
  captureContainer.style.position = 'fixed';
  captureContainer.style.left = '0';
  captureContainer.style.top = '0';
  captureContainer.style.zIndex = '-9999';
  captureContainer.style.opacity = '0';
  captureContainer.style.pointerEvents = 'none';
  captureContainer.style.width = 'max-content';
  captureContainer.style.maxWidth = 'none';
  captureContainer.style.display = 'block';
  captureContainer.style.backgroundColor = '#ffffff';
  captureContainer.appendChild(clone);
  document.body.appendChild(captureContainer);

  try {
    await document.fonts.ready;
    await waitForImages(clone);
    await fixOklchColors(clone);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const tableEl = clone.querySelector('table');
    const tableWidth = tableEl ? Math.ceil(Math.max(tableEl.scrollWidth, tableEl.offsetWidth, tableEl.getBoundingClientRect().width)) : 0;
    
    const computedStyle = window.getComputedStyle(clone);
    const padLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const padRight = parseFloat(computedStyle.paddingRight) || 0;
    const minWidth = groupKey === 'quick' ? (tableWidth + padLeft + padRight + 20) : 600;
    const finalWidth = Math.ceil(Math.max(tableWidth + padLeft + padRight + 20, minWidth));

    // Explicitly constrain clone, captureContainer, and all child div containers to finalWidth
    clone.style.setProperty('width', `${finalWidth}px`, 'important');
    clone.style.setProperty('min-width', `${finalWidth}px`, 'important');
    clone.style.setProperty('max-width', `${finalWidth}px`, 'important');
    captureContainer.style.setProperty('width', `${finalWidth}px`, 'important');
    captureContainer.style.setProperty('min-width', `${finalWidth}px`, 'important');
    captureContainer.style.setProperty('max-width', `${finalWidth}px`, 'important');

    clone.querySelectorAll<HTMLElement>('div, section, main, header, container, [id*="root"]').forEach((div) => {
      if (div.closest('table')) return;
      div.style.setProperty('width', '100%', 'important');
      div.style.setProperty('max-width', '100%', 'important');
      div.style.setProperty('box-sizing', 'border-box', 'important');
    });

    if (tableEl) {
      tableEl.style.setProperty('width', '100%', 'important');
      tableEl.style.setProperty('max-width', '100%', 'important');
      tableEl.style.setProperty('box-sizing', 'border-box', 'important');
    }

    // Ensure top title bar flex containers don't push title text to the right after export-hide elements are removed
    clone.querySelectorAll<HTMLElement>('.justify-between, .justify-start').forEach((el) => {
      el.style.setProperty('justify-content', 'flex-start', 'important');
      el.style.setProperty('gap', '12px', 'important');
    });

    const cloneScrollHeight = Math.ceil(clone.scrollHeight);
    const cloneOffsetHeight = Math.ceil(clone.offsetHeight);
    const cloneBoundingHeight = Math.ceil(clone.getBoundingClientRect().height);
    const height = Math.max(cloneScrollHeight, cloneOffsetHeight, cloneBoundingHeight, 350) + 4;

    const finalScale = computeSafeScale(finalWidth, height, scale);

    const htmlToImage = await import('html-to-image');
    const blob = await htmlToImage.toBlob(clone, {
      pixelRatio: finalScale,
      backgroundColor: '#ffffff',
      width: finalWidth,
      height,
    });

    if (!blob) throw new Error('html-to-image trả về rỗng.');
    downloadBlob(blob, filename, false, options.remarkTextToCopy);
    return blob;
  } catch (error) {
    console.error(`Lỗi khi xuất ảnh "${filename}":`, error);
    return null;
  } finally {
    document.body.removeChild(captureContainer);
  }
}

/**
 * Higher-level helper to trigger export of either:
 * - 3 separate group PNG files (ICT, DỊCH VỤ, CE & GIA DỤNG)
 * - 1 single full matrix PNG file (ALL)
 * - 1 specific group PNG file
 */
export async function exportCategoryGroupImages(
  target: 'ict' | 'dichvu' | 'ce' | 'all' | 'by_groups',
  timeMode: string
): Promise<number> {
  const rootEl = document.getElementById('report-export-root');
  if (!rootEl) return 0;

  const groupLabels: Record<string, string> = {
    ict: 'Nhom_ICT',
    dichvu: 'Nhom_DichVu',
    ce: 'Nhom_CE_GiaDung',
    all: 'Tat_Ca_38_Nganh_Hang',
  };

  const targetsToExport: ('ict' | 'dichvu' | 'ce' | 'all')[] =
    target === 'by_groups' ? ['ict', 'dichvu', 'ce'] : [target];

  let exportedCount = 0;
  const timeTag = timeMode === 'realtime' ? 'Realtime' : 'LuyKe';

  for (const groupKey of targetsToExport) {
    const filename = `Bang_Xep_Hang_${groupLabels[groupKey] || 'Nhom'}_${timeTag}_${new Date().toISOString().slice(0, 10)}.png`;
    const res = await exportGroupSpecificElement(rootEl, groupKey, filename);
    if (res) exportedCount++;
  }

  return exportedCount;
}
