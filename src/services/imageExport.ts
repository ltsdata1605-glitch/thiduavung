/**
 * Element-to-PNG export, ported (and trimmed down) from a sister project's
 * proven implementation, then moved off html-to-image onto html2canvas-pro
 * after two fundamental incompatibilities surfaced on mobile Safari/WebKit:
 *  1. html-to-image clones the node through a step that copies EVERY
 *     computed CSS property (hundreds of them) onto EVERY cloned element —
 *     for a report table with thousands of cells that blew up into tens of
 *     millions of characters of intermediate SVG markup.
 *  2. html-to-image rasterizes by loading that SVG through
 *     `<img src="data:image/svg+xml,...">`, and WebKit taints (or outright
 *     refuses to load) any canvas an SVG-with-foreignObject image was drawn
 *     onto, unconditionally — no workaround exists within that technique.
 * html2canvas-pro paints natively via Canvas 2D drawing primitives instead
 * of an SVG/foreignObject round-trip, sidestepping both problems, and
 * (unlike upstream html2canvas) understands Tailwind v4's oklch() colors
 * directly, so no separate color-fixing pass is needed either.
 *
 * The report table also scrolls horizontally with frozen (sticky) columns —
 * a naive capture only grabs whatever's currently scrolled into view. The
 * clone's scrollable containers are expanded to full content size before
 * capture so every column ends up in the image.
 */

import html2canvas from 'html2canvas-pro';
import { formatStoreDisplayName } from '../utils/parser';

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

export const isMobileUserAgent = () =>
  typeof window !== 'undefined' && (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768);

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
 * Copy a PNG blob directly to clipboard on desktop/laptop.
 */
export async function copyImageToClipboard(blob: Blob): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !navigator.clipboard) return false;

    let pngBlob = blob;
    if (blob.type !== 'image/png') {
      pngBlob = new Blob([blob], { type: 'image/png' });
    }

    if (typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlob,
        }),
      ]);
      return true;
    }
  } catch (err) {
    console.warn('Clipboard image copy failed or unsupported:', err);
  }
  return false;
}

/**
 * Robust copy text to clipboard with fallback for non-secure contexts or permission restrictions.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard API if available
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.warn('navigator.clipboard.writeText failed, falling back to execCommand:', err);
    }
  }

  // 2. Fallback using temporary textarea + document.execCommand('copy')
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.contain = 'strict';
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);

    const range = document.createRange();
    range.selectNodeContents(textArea);
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
    textArea.setSelectionRange(0, text.length);

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback execCommand copy failed:', err);
    return false;
  }
}

/**
 * Hand a Blob off to the user:
 * - On mobile: Auto copy REMARK (text) to clipboard instead of copying image, and open native OS share sheet / download.
 * - On desktop/laptop: Auto copy PNG Image to clipboard by default, trigger file download,
 *   and emit global 'export-image-success' event to trigger notification popup.
 */
export function downloadBlob(
  blob: Blob,
  filename: string,
  forceDownload = false,
  remarkTextToCopy?: string,
  remarkContext?: Record<string, any>
) {
  const isMobile = isMobileUserAgent();

  // 1. Copy behavior
  if (isMobile) {
    // Trên điện thoại di động: Tự động copy nhận xét vào clipboard thay vì copy ảnh
    if (remarkTextToCopy) {
      void copyTextToClipboard(remarkTextToCopy);
    }
  } else {
    // Trên máy tính/laptop: Mặc định tự động copy ẢNH vào clipboard
    void copyImageToClipboard(blob);
  }

  // 2. Bắn sự kiện hiển thị Popup Thông Báo Xuất Ảnh Thành Công
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('export-image-success', {
        detail: {
          blob,
          filename,
          remarkText: remarkTextToCopy || '',
          remarkContext,
        },
      })
    );
  }

  // 3. Tự động tải xuống file ảnh / share trên mobile
  if (!forceDownload && isMobile && canShareFiles()) {
    void shareBlob(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    try {
      if (link.parentNode) link.parentNode.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {}
  }, 60000);
}

export interface ExportElementOptions {
  /** CSS selectors to strip from the clone entirely (buttons, filter bars, etc). */
  elementsToHide?: string[];
  /** Export scale multiplier — higher = sharper but heavier. */
  scale?: number;
  /** White border margin around the exported image in CSS pixels (default: 12). */
  borderWidth?: number;
  /** Remark text to automatically copy to clipboard on export */
  remarkTextToCopy?: string;
  /** Context parameters for generating dynamic remark templates */
  remarkContext?: Record<string, any>;
  /** When true, strip all elements with data-quick-hide attribute (Xuất nhanh). */
  quickHideColumns?: boolean;
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
 * Compute the highest possible scale that will not exceed mobile/browser
 * GPU texture limits (which otherwise turns the canvas 100% pitch black on iOS/Android).
 */
function computeSafeScale(targetWidth: number, targetHeight: number, requestedScale: number = 3.5): number {
  const isMobile =
    typeof navigator !== 'undefined' &&
    (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (typeof window !== 'undefined' && window.innerWidth < 768));

  // Mobile WebKit / Safari limits: 4096px max dimension or ~14 Megapixels total area.
  // Desktop modern browsers support up to 16384px and 80 Megapixels.
  const maxDim = isMobile ? 4096 : 16384;
  const maxArea = isMobile ? 14 * 1024 * 1024 : 80 * 1024 * 1024;

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

  // Hardware boundary check (never exceed maxDim)
  const hardwareMaxScale = Math.min(maxDim / Math.max(targetWidth, 1), maxDim / Math.max(targetHeight, 1));
  safeScale = Math.min(safeScale, hardwareMaxScale);

  // Allow scale down to 0.35 for huge datasets so canvas never crashes
  return Math.max(0.35, Math.round(safeScale * 100) / 100);
}

/**
 * Recursively copy computed visual styles (colors, background, font, borders) from
 * the live DOM element tree to the cloned element tree. This guarantees that all
 * Tailwind v4 colors, custom fonts, CSS variables, and theme values are preserved
 * 100% in the exported canvas even if stylesheet loading fails in the sandbox iframe.
 */
function copyComputedVisualStyles(source: HTMLElement, target: HTMLElement) {
  try {
    const srcList = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))];
    const tgtList = [target, ...Array.from(target.querySelectorAll<HTMLElement>('*'))];

    for (let i = 0; i < srcList.length && i < tgtList.length; i++) {
      const s = srcList[i];
      const t = tgtList[i];
      if (!s || !t) continue;

      const cs = window.getComputedStyle(s);
      if (!cs) continue;

      // 1. Background color (preserve non-transparent backgrounds)
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') {
        t.style.setProperty('background-color', cs.backgroundColor, 'important');
      }

      // 2. Text color
      if (cs.color) {
        t.style.setProperty('color', cs.color, 'important');
      }

      // 3. Typography
      if (cs.fontFamily) {
        t.style.setProperty('font-family', cs.fontFamily, 'important');
      }
      if (cs.fontWeight) {
        t.style.setProperty('font-weight', cs.fontWeight, 'important');
      }
      if (cs.fontSize) {
        t.style.setProperty('font-size', cs.fontSize, 'important');
      }

      // 4. Borders
      if (cs.borderTopColor && cs.borderTopWidth && cs.borderTopWidth !== '0px') {
        t.style.setProperty('border-top-color', cs.borderTopColor, 'important');
        t.style.setProperty('border-top-width', cs.borderTopWidth, 'important');
        t.style.setProperty('border-top-style', cs.borderTopStyle || 'solid', 'important');
      }
      if (cs.borderBottomColor && cs.borderBottomWidth && cs.borderBottomWidth !== '0px') {
        t.style.setProperty('border-bottom-color', cs.borderBottomColor, 'important');
        t.style.setProperty('border-bottom-width', cs.borderBottomWidth, 'important');
        t.style.setProperty('border-bottom-style', cs.borderBottomStyle || 'solid', 'important');
      }
      if (cs.borderLeftColor && cs.borderLeftWidth && cs.borderLeftWidth !== '0px') {
        t.style.setProperty('border-left-color', cs.borderLeftColor, 'important');
        t.style.setProperty('border-left-width', cs.borderLeftWidth, 'important');
        t.style.setProperty('border-left-style', cs.borderLeftStyle || 'solid', 'important');
      }
      if (cs.borderRightColor && cs.borderRightWidth && cs.borderRightWidth !== '0px') {
        t.style.setProperty('border-right-color', cs.borderRightColor, 'important');
        t.style.setProperty('border-right-width', cs.borderRightWidth, 'important');
        t.style.setProperty('border-right-style', cs.borderRightStyle || 'solid', 'important');
      }
    }
  } catch (err) {
    console.warn('copyComputedVisualStyles notice:', err);
  }
}

/**
 * Synchronize column widths across all tables in Tab TỔNG (#revenue-tong-card)
 * so that KÊNH width == TỈNH width, and all numeric columns have exact matching widths.
 */
function syncTongCardColumns(card: HTMLElement) {
  try {
    card.style.setProperty('border-radius', '0', 'important');
    card.style.setProperty('margin', '0', 'important');
    card.style.setProperty('margin-top', '0', 'important');
    card.style.setProperty('margin-bottom', '0', 'important');
    card.style.setProperty('width', '580px', 'important');
    card.style.setProperty('min-width', '580px', 'important');
    card.style.setProperty('max-width', '580px', 'important');
    card.style.setProperty('box-sizing', 'border-box', 'important');

    card.querySelectorAll<HTMLElement>('.overflow-x-auto').forEach((c) => {
      c.style.setProperty('width', '100%', 'important');
      c.style.setProperty('min-width', '100%', 'important');
      c.style.setProperty('max-width', '100%', 'important');
      c.style.setProperty('overflow', 'visible', 'important');
    });

    const colPxWidths = ['124px', '114px', '114px', '114px', '114px'];

    card.querySelectorAll<HTMLElement>('table').forEach((table) => {
      table.classList.add('table-fixed');
      table.style.setProperty('width', '578px', 'important');
      table.style.setProperty('min-width', '578px', 'important');
      table.style.setProperty('max-width', '578px', 'important');
      table.style.setProperty('table-layout', 'fixed', 'important');
      table.style.setProperty('box-sizing', 'border-box', 'important');

      const cols = table.querySelectorAll<HTMLElement>('colgroup col');
      cols.forEach((c, idx) => {
        if (idx < colPxWidths.length) {
          c.style.setProperty('width', colPxWidths[idx], 'important');
          c.setAttribute('width', colPxWidths[idx].replace('px', ''));
        }
      });

      const tr1 = table.querySelector('thead tr:first-child');
      if (tr1 && tr1.children.length === 3) {
        const th0 = tr1.children[0] as HTMLElement;
        th0.style.setProperty('width', '350px', 'important'); // 124 + 114 + 114 = 352px (~350px with borders)
        th0.style.setProperty('min-width', '350px', 'important');
        th0.style.setProperty('max-width', '350px', 'important');
        th0.style.setProperty('box-sizing', 'border-box', 'important');

        const th1 = tr1.children[1] as HTMLElement;
        th1.style.setProperty('width', '114px', 'important');
        th1.style.setProperty('min-width', '114px', 'important');
        th1.style.setProperty('max-width', '114px', 'important');
        th1.style.setProperty('box-sizing', 'border-box', 'important');

        const th2 = tr1.children[2] as HTMLElement;
        th2.style.setProperty('width', '114px', 'important');
        th2.style.setProperty('min-width', '114px', 'important');
        th2.style.setProperty('max-width', '114px', 'important');
        th2.style.setProperty('box-sizing', 'border-box', 'important');
      }

      const tr2 = table.querySelector('thead tr:nth-child(2)');
      if (tr2 && tr2.children.length === 3) {
        const th0 = tr2.children[0] as HTMLElement;
        th0.style.setProperty('width', '124px', 'important');
        th0.style.setProperty('min-width', '124px', 'important');
        th0.style.setProperty('max-width', '124px', 'important');
        th0.style.setProperty('box-sizing', 'border-box', 'important');

        const th1 = tr2.children[1] as HTMLElement;
        th1.style.setProperty('width', '114px', 'important');
        th1.style.setProperty('min-width', '114px', 'important');
        th1.style.setProperty('max-width', '114px', 'important');
        th1.style.setProperty('box-sizing', 'border-box', 'important');

        const th2 = tr2.children[2] as HTMLElement;
        th2.style.setProperty('width', '114px', 'important');
        th2.style.setProperty('min-width', '114px', 'important');
        th2.style.setProperty('max-width', '114px', 'important');
        th2.style.setProperty('box-sizing', 'border-box', 'important');
      }

      table.querySelectorAll<HTMLElement>('tbody tr, tfoot tr').forEach((tr) => {
        if (tr.children.length === 5) {
          Array.from(tr.children).forEach((td, idx) => {
            const el = td as HTMLElement;
            el.style.setProperty('width', colPxWidths[idx], 'important');
            el.style.setProperty('min-width', colPxWidths[idx], 'important');
            el.style.setProperty('max-width', colPxWidths[idx], 'important');
            el.style.setProperty('box-sizing', 'border-box', 'important');
          });
        }
      });
    });
  } catch (err) {
    console.warn('syncTongCardColumns notice:', err);
  }
}

/**
 * Trim pure white / transparent excess vertical space from the bottom of the canvas.
 * This guarantees that exported images never have trailing dead white space.
 */
function cropCanvasBottom(canvas: HTMLCanvasElement, maxPaddingPx: number = 2): HTMLCanvasElement {
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return canvas;

    const width = canvas.width;
    const height = canvas.height;
    if (width <= 0 || height <= 0) return canvas;

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let lastContentY = -1;
    const stepX = Math.max(1, Math.floor(width / 200));

    for (let y = height - 1; y >= 0; y--) {
      const rowOffset = y * width * 4;
      let isRowWhite = true;

      for (let x = 0; x < width; x += stepX) {
        const idx = rowOffset + x * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        if (a > 20 && (r < 250 || g < 250 || b < 250)) {
          isRowWhite = false;
          break;
        }
      }

      if (!isRowWhite) {
        lastContentY = y;
        break;
      }
    }

    if (lastContentY > 0 && height - lastContentY > 6) {
      const targetHeight = Math.min(height, lastContentY + maxPaddingPx);
      const croppedCanvas = document.createElement('canvas');
      croppedCanvas.width = width;
      croppedCanvas.height = targetHeight;
      const croppedCtx = croppedCanvas.getContext('2d');
      if (croppedCtx) {
        croppedCtx.imageSmoothingEnabled = true;
        croppedCtx.imageSmoothingQuality = 'high';
        croppedCtx.drawImage(canvas, 0, 0, width, targetHeight, 0, 0, width, targetHeight);
        return croppedCanvas;
      }
    }
  } catch (err) {
    console.warn('cropCanvasBottom notice:', err);
  }
  return canvas;
}

/**
 * Rasterize `node` (already fully prepared: colors resolved, scrollable
 * containers expanded, dimensions locked to width/height) to a PNG Blob via
 * html2canvas-pro, retrying at progressively lower scales so a
 * memory-constrained mobile device still gets an image rather than nothing.
 *
 * Adds a thin, clean white border around the final canvas for a polished,
 * professional aesthetic on chat apps (Zalo, Messenger, Teams) and dark backgrounds.
 */
async function rasterizeToBlob(
  node: HTMLElement,
  width: number,
  height: number,
  requestedScale: number,
  borderMargin: number = 12
): Promise<Blob | null> {
  const finalScale = computeSafeScale(width, height, requestedScale);
  const scalesToTry = [
    finalScale,
    Math.round(finalScale * 0.8 * 100) / 100,
    Math.round(finalScale * 0.6 * 100) / 100,
    Math.round(finalScale * 0.45 * 100) / 100,
    0.35,
  ].filter((s, idx, arr) => s >= 0.3 && (idx === 0 || s < arr[idx - 1]));

  for (const curScale of scalesToTry) {
    try {
      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        scale: curScale,
        width,
        height,
        windowWidth: Math.max(typeof window !== 'undefined' ? window.innerWidth : 1200, width, 1024),
        useCORS: true,
        allowTaint: false,
        imageTimeout: 15000,
        logging: false,
        onclone: (clonedDoc) => {
          // 1. Inject base URL to resolve relative fonts and stylesheets inside iframe
          try {
            const base = clonedDoc.createElement('base');
            base.href = window.location.href;
            clonedDoc.head.appendChild(base);
          } catch {}

          // 2. Clone all <style> tags from parent document
          try {
            document.querySelectorAll('style').forEach((st) => {
              clonedDoc.head.appendChild(st.cloneNode(true));
            });
          } catch {}

          // 3. Inline all CSS rules from linked stylesheets into clonedDoc
          try {
            const combinedCss = Array.from(document.styleSheets)
              .map((sheet) => {
                try {
                  return Array.from(sheet.cssRules)
                    .map((r) => r.cssText)
                    .join('\n');
                } catch {
                  return '';
                }
              })
              .join('\n');

            if (combinedCss) {
              const inlineStyle = clonedDoc.createElement('style');
              inlineStyle.textContent = combinedCss;
              clonedDoc.head.appendChild(inlineStyle);
            }
          } catch (err) {
            console.warn('onclone CSS inlining notice:', err);
          }

          // 4. Inject high quality font antialiasing and text rendering styles
          try {
            const fontQualityStyle = clonedDoc.createElement('style');
            fontQualityStyle.textContent = `
              * {
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                text-rendering: optimizeLegibility !important;
              }
            `;
            clonedDoc.head.appendChild(fontQualityStyle);
          } catch {}

          // 5. Ensure Tab TỔNG tables in clonedDoc have exact synchronized column widths & exact height
          try {
            const clonedTongCard = (clonedDoc.getElementById('revenue-tong-card') || clonedDoc.querySelector('#revenue-tong-card')) as HTMLElement | null;
            if (clonedTongCard) {
              syncTongCardColumns(clonedTongCard);
              const tables = clonedTongCard.querySelectorAll('table');
              const lastTable = tables[tables.length - 1];
              const lastRow = lastTable ? (lastTable.querySelector('tbody tr:last-child') || lastTable.querySelector('tr:last-child')) : null;
              if (lastRow) {
                const cardRect = clonedTongCard.getBoundingClientRect();
                const rowRect = lastRow.getBoundingClientRect();
                const exactBottom = Math.ceil(rowRect.bottom - cardRect.top + 1);
                if (exactBottom > 200) {
                  clonedTongCard.style.setProperty('height', `${exactBottom}px`, 'important');
                  clonedTongCard.style.setProperty('max-height', `${exactBottom}px`, 'important');
                  clonedTongCard.style.setProperty('overflow', 'hidden', 'important');
                }
              }
            }
          } catch (err) {
            console.warn('onclone syncTongCardColumns notice:', err);
          }
        },
      });

      // Trim any trailing pure white rows from the bottom of the canvas
      const trimmedCanvas = cropCanvasBottom(canvas, Math.max(1, Math.round(curScale)));

      // Tạo viền trắng bao quanh mỏng đẹp mắt và chuyên nghiệp
      const border = borderMargin > 0 ? Math.max(2, Math.round(borderMargin * curScale)) : 0;

      let targetCanvas: HTMLCanvasElement = trimmedCanvas;
      if (border > 0) {
        const framedCanvas = document.createElement('canvas');
        framedCanvas.width = trimmedCanvas.width + border * 2;
        framedCanvas.height = trimmedCanvas.height + border * 2;
        const ctx = framedCanvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, framedCanvas.width, framedCanvas.height);
          ctx.drawImage(trimmedCanvas, border, border);
          targetCanvas = framedCanvas;
        }
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        try {
          targetCanvas.toBlob((b) => resolve(b), 'image/png');
        } catch (e) {
          console.warn('targetCanvas.toBlob failed:', e);
          resolve(null);
        }
      });
      if (blob && blob.size > 0) return blob;
    } catch (scaleErr) {
      console.warn(`html2canvas failed at scale ${curScale}, trying fallback scale...`, scaleErr);
    }
  }
  return null;
}

/**
 * Clone `element`, fix everything that would otherwise render wrong/missing
 * in the export (scrolled-out table columns, Recharts SVGs, scrollbars),
 * then rasterize it to a PNG Blob.
 */
export async function exportElementAsImage(
  element: HTMLElement,
  filename: string,
  options: ExportElementOptions = {}
): Promise<Blob | null> {
  const { elementsToHide = ['.export-hide'], scale = 3.5, borderWidth = 12, quickHideColumns = false } = options;

  const clone = element.cloneNode(true) as HTMLElement;

  // Bake live computed visual styles (RGB colors, fonts, borders) into clone
  copyComputedVisualStyles(element, clone);

  // Remove control bars and camera export buttons
  elementsToHide.forEach((selector) => {
    clone.querySelectorAll<HTMLElement>(selector).forEach((el) => el.remove());
  });

  // Xuất nhanh: strip all columns marked with data-quick-hide
  if (quickHideColumns) {
    clone.querySelectorAll<HTMLElement>('[data-quick-hide]').forEach((el) => el.remove());
    // Adjust colSpan for cells that have a data-quick-colspan override
    clone.querySelectorAll<HTMLElement>('[data-quick-colspan]').forEach((el) => {
      const newSpan = parseInt(el.getAttribute('data-quick-colspan') || '1', 10);
      el.setAttribute('colspan', String(newSpan));
      el.removeAttribute('data-quick-colspan');
    });
    // Fix colSpan on remaining header cells after removing quick-hide columns
    clone.querySelectorAll<HTMLElement>('thead tr').forEach((tr) => {
      if (tr.children.length === 0) tr.remove();
    });
    // Remove colgroups and reset table layout for clean auto-sizing
    clone.querySelectorAll('colgroup').forEach((cg) => cg.remove());
    clone.querySelectorAll<HTMLElement>('table').forEach((table) => {
      table.classList.remove('table-fixed');
      table.style.setProperty('width', 'max-content', 'important');
      table.style.setProperty('min-width', 'max-content', 'important');
      table.style.setProperty('max-width', 'none', 'important');
      table.style.setProperty('table-layout', 'auto', 'important');
    });
    clone.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
      cell.style.setProperty('box-sizing', 'border-box', 'important');
    });
    clone.querySelectorAll<HTMLElement>('td').forEach((td) => {
      td.style.setProperty('white-space', 'nowrap', 'important');
    });
  }

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

  // Ensure titles and header text wrap naturally without ellipsis ("...")
  clone.querySelectorAll<HTMLElement>('h1, h2, h3, h4, .truncate').forEach((el) => {
    el.classList.remove('truncate');
    el.style.setProperty('white-space', 'normal', 'important');
    el.style.setProperty('word-break', 'break-word', 'important');
    el.style.setProperty('overflow-wrap', 'break-word', 'important');
    el.style.setProperty('text-overflow', 'clip', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
  });

  const isTongCard = clone.id === 'revenue-tong-card' || !!clone.querySelector('#revenue-tong-card');
  if (isTongCard && clone.id !== 'revenue-tong-card') {
    const innerTongCard = clone.querySelector<HTMLElement>('#revenue-tong-card');
    if (innerTongCard) {
      clone.innerHTML = innerTongCard.innerHTML;
      clone.id = 'revenue-tong-card';
      clone.className = innerTongCard.className;
    }
  }

  // Remove all colgroups in tables so they don't constrain column widths artificially (except Tab TỔNG)
  clone.querySelectorAll<HTMLElement>('table').forEach((table) => {
    if (isTongCard && (table.closest('#revenue-tong-card') || clone.id === 'revenue-tong-card')) {
      return; // Keep table-fixed and colgroups for Tab TỔNG
    }
    table.querySelectorAll('colgroup').forEach((cg) => cg.remove());
    table.classList.remove('table-fixed');
    table.style.setProperty('width', 'max-content', 'important');
    table.style.setProperty('min-width', 'max-content', 'important');
    table.style.setProperty('max-width', 'none', 'important');
    table.style.setProperty('table-layout', 'auto', 'important');
  });

  // Let all table cells size naturally to their contents with clean, consistent padding (except Tab TỔNG)
  clone.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
    if (isTongCard && (cell.closest('#revenue-tong-card') || clone.id === 'revenue-tong-card')) {
      cell.style.setProperty('padding-left', '4px', 'important');
      cell.style.setProperty('padding-right', '4px', 'important');
      cell.style.setProperty('box-sizing', 'border-box', 'important');
      cell.style.setProperty('white-space', 'nowrap', 'important');
      return; // Keep defined column widths for Tab TỔNG
    }
    cell.style.setProperty('width', 'auto', 'important');
    cell.style.setProperty('min-width', 'auto', 'important');
    cell.style.setProperty('max-width', 'none', 'important');
    cell.style.setProperty('padding-left', '8px', 'important');
    cell.style.setProperty('padding-right', '8px', 'important');
    cell.style.setProperty('box-sizing', 'border-box', 'important');
    cell.style.setProperty('white-space', 'nowrap', 'important');
  });

  // Ensure category header titles wrap cleanly on \n breaks (max 6 chars per line)
  clone.querySelectorAll<HTMLElement>('th[data-group], th div, th span, .whitespace-pre-line').forEach((el) => {
    if (isTongCard && (el.closest('#revenue-tong-card') || clone.id === 'revenue-tong-card')) {
      return;
    }
    el.style.setProperty('white-space', 'pre-line', 'important');
    el.style.setProperty('word-break', 'break-word', 'important');
    el.style.setProperty('line-height', '1.15', 'important');
    el.style.setProperty('text-align', 'center', 'important');
    el.style.setProperty('max-width', 'none', 'important');
    el.style.setProperty('width', 'auto', 'important');
  });

  // Expand scrollable containers to show ALL content (no clipping)
  clone.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-y-auto, [class*="max-h-"]').forEach((container) => {
    container.style.setProperty('overflow', 'visible', 'important');
    container.style.setProperty('max-height', 'none', 'important');
    container.style.setProperty('height', 'auto', 'important');
    container.style.setProperty('width', 'max-content', 'important');
    container.style.setProperty('max-width', 'none', 'important');
  });

  // Ensure Tab TOP/BOT 2-column layout renders side-by-side in single image
  const topbotContainer = clone.querySelector<HTMLElement>('#topbot-report-container');
  if (topbotContainer) {
    topbotContainer.style.setProperty('display', 'grid', 'important');
    topbotContainer.style.setProperty('grid-template-columns', 'repeat(2, minmax(0, 1fr))', 'important');
    topbotContainer.style.setProperty('gap', '16px', 'important');
    topbotContainer.style.setProperty('width', '1180px', 'important');
    topbotContainer.style.setProperty('min-width', '1180px', 'important');
    topbotContainer.style.setProperty('max-width', '1180px', 'important');

    topbotContainer.querySelectorAll<HTMLElement>('.overflow-x-auto').forEach((c) => {
      c.style.setProperty('width', '100%', 'important');
      c.style.setProperty('min-width', '100%', 'important');
      c.style.setProperty('max-width', '100%', 'important');
    });

    topbotContainer.querySelectorAll<HTMLElement>('table').forEach((t) => {
      t.style.setProperty('width', '100%', 'important');
      t.style.setProperty('min-width', '100%', 'important');
      t.style.setProperty('max-width', '100%', 'important');
      t.style.setProperty('table-layout', 'auto', 'important');
    });
  }

  // Ensure Tab TỔNG (Revenue) tables have synchronized, aligned columns and no rounded corners
  const tongCard = (clone.id === 'revenue-tong-card' ? clone : clone.querySelector<HTMLElement>('#revenue-tong-card')) as HTMLElement | null;
  if (tongCard) {
    syncTongCardColumns(tongCard);
  }

  // Remove rounded corners on the outer export frame when exporting tab TỔNG / revenue export
  if (isTongCard || clone.id === 'revenue-report-export-root') {
    clone.style.setProperty('border-radius', '0', 'important');
    clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
      const cls = el.className;
      if (typeof cls === 'string' && cls.includes('rounded')) {
        el.style.setProperty('border-radius', '0', 'important');
      }
    });
  }

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
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Re-measure after DOM attachment across all tables (skip for Tab TỔNG so table-fixed is preserved)
    const tablesInClone = Array.from(clone.querySelectorAll<HTMLElement>('table'));
    let maxTableContentWidth = 0;

    if (!isTongCard) {
      tablesInClone.forEach((t) => {
        t.style.setProperty('width', 'max-content', 'important');
        t.style.setProperty('min-width', 'auto', 'important');
        t.style.setProperty('max-width', 'none', 'important');
        t.style.setProperty('table-layout', 'auto', 'important');

        const rect = t.getBoundingClientRect();
        const scrollW = t.scrollWidth;
        const offsetW = t.offsetWidth;
        let w = Math.max(scrollW, offsetW, rect.width);

        // Check rightmost cell boundary
        t.querySelectorAll<HTMLElement>('tr').forEach((row) => {
          const lastCell = row.lastElementChild as HTMLElement | null;
          if (lastCell) {
            const cellRect = lastCell.getBoundingClientRect();
            const cellRightRelativeToTable = cellRect.right - rect.left;
            if (cellRightRelativeToTable > w) {
              w = cellRightRelativeToTable;
            }
          }
        });

        if (w > maxTableContentWidth) {
          maxTableContentWidth = w;
        }
      });
    }

    // Check if Top/Bot 2-column grid exists and calculate total combined width
    const topbotInClone = clone.querySelector<HTMLElement>('#topbot-report-container');
    if (topbotInClone) {
      let combinedWidth = 0;
      const cols = Array.from(topbotInClone.children) as HTMLElement[];
      cols.forEach((col) => {
        const colTable = col.querySelector('table');
        const colW = colTable
          ? Math.max(colTable.scrollWidth, colTable.offsetWidth, colTable.getBoundingClientRect().width)
          : col.offsetWidth;
        combinedWidth += Math.max(colW, 600);
      });
      combinedWidth += 24; // 16px gap + margin
      maxTableContentWidth = Math.max(maxTableContentWidth, combinedWidth, 1220);
    }

    const tongCardInClone = (clone.id === 'revenue-tong-card' ? clone : clone.querySelector<HTMLElement>('#revenue-tong-card')) as HTMLElement | null;

    if (!isTongCard && maxTableContentWidth === 0) {
      maxTableContentWidth = Math.ceil(Math.max(clone.scrollWidth, clone.offsetWidth, clone.getBoundingClientRect().width));
    }

    // Account for card padding/borders + 12px buffer for 25+ column borders and anti-aliasing
    const computedStyle = window.getComputedStyle(clone);
    const padLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const padRight = parseFloat(computedStyle.paddingRight) || 0;
    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
    const totalRequiredWidth = Math.ceil(maxTableContentWidth + padLeft + padRight + borderLeft + borderRight + 12);

    const isSingleTopBotCard = clone.id === 'topbot-card-dtqd' || clone.id === 'topbot-card-rate';
    // Tab TỔNG card has exact fixed width 580px, single TopBot card has 620px
    const finalWidth = isTongCard ? 580 : isSingleTopBotCard ? 620 : Math.ceil(Math.max(totalRequiredWidth, 360));

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

    if (!isTongCard) {
      tablesInClone.forEach((table) => {
        table.style.setProperty('width', '100%', 'important');
        table.style.setProperty('min-width', '100%', 'important');
        table.style.setProperty('max-width', '100%', 'important');
        table.style.setProperty('box-sizing', 'border-box', 'important');
      });
    }

    if (topbotInClone) {
      topbotInClone.style.setProperty('display', 'grid', 'important');
      topbotInClone.style.setProperty('grid-template-columns', 'repeat(2, minmax(0, 1fr))', 'important');
      topbotInClone.style.setProperty('gap', '16px', 'important');
      topbotInClone.style.setProperty('width', '100%', 'important');
      topbotInClone.style.setProperty('min-width', '100%', 'important');
      topbotInClone.style.setProperty('max-width', '100%', 'important');

      const cols = Array.from(topbotInClone.children) as HTMLElement[];
      cols.forEach((col) => {
        col.style.setProperty('width', '100%', 'important');
        col.style.setProperty('min-width', '0', 'important');
        col.style.setProperty('max-width', 'none', 'important');
      });
    }

    if (tongCardInClone) {
      syncTongCardColumns(tongCardInClone);
    }

    const isRevenueExport =
      isTongCard ||
      isSingleTopBotCard ||
      clone.id === 'revenue-report-export-root' ||
      clone.id === 'revenue-tong-card' ||
      clone.id.startsWith('topbot-card-') ||
      !!clone.querySelector('#revenue-tong-card, #topbot-report-container');

    if (isRevenueExport) {
      clone.style.setProperty('border-radius', '0', 'important');
      clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
        el.style.setProperty('border-radius', '0', 'important');
      });
    }

    // Calculate exact content height reliably without trailing white space
    let height = 0;
    const cloneRect = clone.getBoundingClientRect();

    if (isTongCard) {
      // For Tab TỔNG: lock height directly to the bottom border of the last row of Table 2
      let maxBottom = 0;
      const tables = clone.querySelectorAll<HTMLElement>('table');
      const lastTable = tables[tables.length - 1];
      const lastRow = lastTable ? (lastTable.querySelector('tbody tr:last-child') || lastTable.querySelector('tr:last-child')) : null;
      if (lastRow) {
        const r = lastRow.getBoundingClientRect();
        maxBottom = r.bottom - cloneRect.top;
      }
      if (!maxBottom || maxBottom <= 200) {
        clone.querySelectorAll<HTMLElement>('table, tr:last-child').forEach((el) => {
          const r = el.getBoundingClientRect();
          const rel = r.bottom - cloneRect.top;
          if (rel > maxBottom) maxBottom = rel;
        });
      }
      const cardBorderBottom = parseFloat(window.getComputedStyle(clone).borderBottomWidth) || 1;
      if (maxBottom > 200) {
        height = Math.ceil(maxBottom + cardBorderBottom);
      } else {
        height = Math.ceil(Math.max(clone.scrollHeight, clone.offsetHeight));
      }
    } else {
      let contentBottom = 0;
      const tables = clone.querySelectorAll<HTMLElement>('table');
      if (tables.length > 0) {
        const lastTable = tables[tables.length - 1];
        const lastRow =
          lastTable.querySelector('tfoot tr:last-child') ||
          lastTable.querySelector('tbody tr:last-child') ||
          lastTable.querySelector('tr:last-child');
        if (lastRow) {
          const r = lastRow.getBoundingClientRect();
          contentBottom = r.bottom - cloneRect.top;
        }
      }

      Array.from(clone.children).forEach((child) => {
        const el = child as HTMLElement;
        if (el.offsetHeight > 0 || el.scrollHeight > 0) {
          const r = el.getBoundingClientRect();
          const bottomRel = r.bottom - cloneRect.top;
          if (bottomRel > contentBottom) {
            contentBottom = bottomRel;
          }
        }
      });

      const cloneComputed = window.getComputedStyle(clone);
      const borderBottom = parseFloat(cloneComputed.borderBottomWidth) || 1;

      if (contentBottom > 0) {
        // contentBottom is measured relative to cloneRect.top, so it covers all child elements.
        // For revenue reports, avoid adding redundant bottom padding so the table clips tightly.
        const padBottom = isRevenueExport ? 0 : (parseFloat(cloneComputed.paddingBottom) || 0);
        height = Math.ceil(contentBottom + padBottom + borderBottom);
      } else {
        const cloneScrollHeight = Math.ceil(clone.scrollHeight);
        const cloneOffsetHeight = Math.ceil(clone.offsetHeight);
        const cloneBoundingHeight = Math.ceil(clone.getBoundingClientRect().height);
        height = Math.max(cloneScrollHeight, cloneOffsetHeight, cloneBoundingHeight, 350);
      }
    }

    // Lock clone and captureContainer to exact height so no excess bottom space is rendered
    clone.style.setProperty('height', `${height}px`, 'important');
    clone.style.setProperty('min-height', `${height}px`, 'important');
    clone.style.setProperty('max-height', `${height}px`, 'important');
    captureContainer.style.setProperty('height', `${height}px`, 'important');
    captureContainer.style.setProperty('min-height', `${height}px`, 'important');
    captureContainer.style.setProperty('max-height', `${height}px`, 'important');

    const effectiveBorderWidth = isRevenueExport ? 0 : borderWidth;
    const blob = await rasterizeToBlob(clone, finalWidth, height, scale, effectiveBorderWidth);
    if (!blob) throw new Error('Không thể kết xuất ảnh do kích thước quá lớn.');
    downloadBlob(blob, filename, false, options.remarkTextToCopy, options.remarkContext);
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
  const { elementsToHide = ['.export-hide'], scale = 3.5, borderWidth = 12 } = options;

  const clone = element.cloneNode(true) as HTMLElement;

  // Bake live computed visual styles (RGB colors, fonts, borders) into clone
  copyComputedVisualStyles(element, clone);

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

  // Ensure titles and header text wrap naturally without ellipsis ("...")
  clone.querySelectorAll<HTMLElement>('h1, h2, h3, h4, .truncate').forEach((el) => {
    el.classList.remove('truncate');
    el.style.setProperty('white-space', 'normal', 'important');
    el.style.setProperty('word-break', 'break-word', 'important');
    el.style.setProperty('overflow-wrap', 'break-word', 'important');
    el.style.setProperty('text-overflow', 'clip', 'important');
    el.style.setProperty('overflow', 'visible', 'important');
  });

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

    // Remove existing colgroups
    clone.querySelectorAll('colgroup').forEach((cg) => cg.remove());

    clone.querySelectorAll<HTMLElement>('table').forEach((table) => {
      table.classList.remove('table-fixed');
      table.style.setProperty('width', 'max-content', 'important');
      table.style.setProperty('min-width', 'max-content', 'important');
      table.style.setProperty('max-width', 'none', 'important');
      table.style.setProperty('table-layout', 'auto', 'important');
    });

    clone.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
      cell.style.setProperty('width', 'auto', 'important');
      cell.style.setProperty('min-width', 'auto', 'important');
      cell.style.setProperty('max-width', 'none', 'important');
      cell.style.setProperty('padding-left', '8px', 'important');
      cell.style.setProperty('padding-right', '8px', 'important');
      cell.style.setProperty('box-sizing', 'border-box', 'important');
      cell.style.setProperty('white-space', 'nowrap', 'important');
    });

    clone.querySelectorAll<HTMLElement>('th[data-group], th div, th span, .whitespace-pre-line').forEach((el) => {
      el.style.setProperty('white-space', 'pre-line', 'important');
      el.style.setProperty('word-break', 'break-word', 'important');
      el.style.setProperty('line-height', '1.15', 'important');
      el.style.setProperty('text-align', 'center', 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('width', 'auto', 'important');
    });
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
      table.classList.remove('table-fixed');
      table.style.setProperty('width', 'max-content', 'important');
      table.style.setProperty('min-width', 'max-content', 'important');
      table.style.setProperty('max-width', 'none', 'important');
      table.style.setProperty('table-layout', 'auto', 'important');
    });

    clone.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
      cell.style.setProperty('width', 'auto', 'important');
      cell.style.setProperty('max-width', 'none', 'important');
      cell.style.setProperty('min-width', 'auto', 'important');
      cell.style.setProperty('padding-left', '8px', 'important');
      cell.style.setProperty('padding-right', '8px', 'important');
      cell.style.setProperty('box-sizing', 'border-box', 'important');
      cell.style.setProperty('white-space', 'nowrap', 'important');
    });

    clone.querySelectorAll<HTMLElement>('th[data-group], th div, th span, .whitespace-pre-line').forEach((el) => {
      el.style.setProperty('white-space', 'pre-line', 'important');
      el.style.setProperty('word-break', 'break-word', 'important');
      el.style.setProperty('line-height', '1.15', 'important');
      el.style.setProperty('text-align', 'center', 'important');
      el.style.setProperty('max-width', 'none', 'important');
      el.style.setProperty('width', 'auto', 'important');
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
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const tableEl = clone.querySelector('table');
    let tableWidth = 0;
    if (tableEl) {
      const rect = tableEl.getBoundingClientRect();
      tableWidth = Math.max(tableEl.scrollWidth, tableEl.offsetWidth, rect.width);
      tableEl.querySelectorAll<HTMLElement>('tr').forEach((row) => {
        const lastCell = row.lastElementChild as HTMLElement | null;
        if (lastCell) {
          const cellRect = lastCell.getBoundingClientRect();
          const cellRight = cellRect.right - rect.left;
          if (cellRight > tableWidth) {
            tableWidth = cellRight;
          }
        }
      });
    }

    const computedStyle = window.getComputedStyle(clone);
    const padLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const padRight = parseFloat(computedStyle.paddingRight) || 0;
    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
    const finalWidth = Math.ceil(Math.max(tableWidth + padLeft + padRight + borderLeft + borderRight + 12, 360));

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

    const blob = await rasterizeToBlob(clone, finalWidth, height, scale, borderWidth);
    if (!blob) throw new Error('Không thể kết xuất ảnh do kích thước quá lớn.');
    downloadBlob(blob, filename, false, options.remarkTextToCopy, options.remarkContext);
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
