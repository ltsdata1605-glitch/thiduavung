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

/** Resolve oklch()/color-mix() computed colors to rgb() so the exported PNG doesn't render them as black. */
function fixOklchColors(root: HTMLElement) {
  const cvs = document.createElement('canvas');
  cvs.width = 1;
  cvs.height = 1;
  const ctx = cvs.getContext('2d');
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
  for (const el of els) {
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

/** Download a Blob as a file. */
export function downloadBlob(blob: Blob, filename: string) {
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
 * Clone `element`, fix everything that would otherwise render wrong/missing
 * in the export (oklch colors, scrolled-out table columns, Recharts SVGs, scrollbars),
 * then rasterize it to a PNG Blob via html-to-image.
 */
export async function exportElementAsImage(
  element: HTMLElement,
  filename: string,
  options: ExportElementOptions = {}
): Promise<Blob | null> {
  const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  const { elementsToHide = ['.export-hide'], scale = isMobileDevice ? 1.5 : 2 } = options;

  const clone = element.cloneNode(true) as HTMLElement;

  // Remove control bars and camera export buttons
  elementsToHide.forEach((selector) => {
    clone.querySelectorAll<HTMLElement>(selector).forEach((el) => el.remove());
  });

  // Strip all scrollbars & expand inner containers
  suppressScrollbars(clone);

  // Expand any inner scrollable containers to fit full content height
  clone.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-y-auto, [class*="max-h-"]').forEach((container) => {
    container.style.setProperty('overflow', 'visible', 'important');
    container.style.setProperty('max-height', 'none', 'important');
    container.style.setProperty('height', 'auto', 'important');
    container.style.setProperty('max-width', 'none', 'important');
    container.style.setProperty('width', 'max-content', 'important');
  });

  // Let clone expand naturally to fit its content — do NOT clamp to viewport
  clone.style.setProperty('width', 'max-content', 'important');
  clone.style.setProperty('max-width', 'none', 'important');
  clone.style.setProperty('display', 'inline-block', 'important');

  // Force all inner wrapper divs to also expand
  clone.querySelectorAll<HTMLElement>('div, section, main, header').forEach((div) => {
    div.style.setProperty('width', 'max-content', 'important');
    div.style.setProperty('max-width', 'none', 'important');
    div.style.setProperty('min-width', 'auto', 'important');
    div.style.setProperty('margin-left', '0', 'important');
    div.style.setProperty('margin-right', '0', 'important');
  });

  // Remove fixed colgroups & force auto column widths to fit content tightly when exporting
  clone.querySelectorAll('colgroup').forEach((cg) => cg.remove());
  clone.querySelectorAll<HTMLElement>('table').forEach((table) => {
    table.style.setProperty('table-layout', 'auto', 'important');
    table.style.setProperty('width', 'max-content', 'important');
    table.style.setProperty('box-sizing', 'border-box', 'important');
  });
  clone.querySelectorAll<HTMLElement>('th, td').forEach((cell) => {
    cell.style.setProperty('white-space', 'nowrap', 'important');
    cell.style.setProperty('padding-left', '8px', 'important');
    cell.style.setProperty('padding-right', '8px', 'important');
    cell.style.setProperty('width', 'auto', 'important');
    cell.style.setProperty('max-width', 'none', 'important');
    cell.style.setProperty('min-width', 'auto', 'important');
  });
  // Strip fixed max-width constraints on category title inner containers in clone
  clone.querySelectorAll<HTMLElement>('[class*="max-w-"]').forEach((el) => {
    el.style.setProperty('max-width', 'none', 'important');
    el.style.setProperty('width', 'auto', 'important');
  });

  // Sticky columns only need to stay pinned during live scrolling
  clone.querySelectorAll<HTMLElement>('.sticky').forEach((el) => {
    el.style.setProperty('position', 'static', 'important');
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

  const captureContainer = document.createElement('div');
  captureContainer.style.position = 'absolute';
  captureContainer.style.left = '-9999px';
  captureContainer.style.top = '0';
  captureContainer.style.width = 'max-content';
  captureContainer.style.maxWidth = 'none';
  captureContainer.style.display = 'inline-block';
  captureContainer.appendChild(clone);
  document.body.appendChild(captureContainer);

  try {
    await document.fonts.ready;
    await waitForImages(clone);
    fixOklchColors(clone);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // Measure the actual table width — this is the authoritative width for the export
    const tableEl = clone.querySelector('table');
    const tableWidth = tableEl
      ? Math.ceil(tableEl.getBoundingClientRect().width || tableEl.scrollWidth || tableEl.offsetWidth)
      : 0;

    // If a table exists, constrain the entire clone to the table width so title
    // headers wrap within the table boundary (matching images 1-4 style)
    if (tableWidth > 0) {
      clone.style.setProperty('width', `${tableWidth}px`, 'important');
      clone.style.setProperty('max-width', `${tableWidth}px`, 'important');
      clone.style.setProperty('min-width', `${tableWidth}px`, 'important');
      captureContainer.style.setProperty('width', `${tableWidth}px`, 'important');
      captureContainer.style.setProperty('max-width', `${tableWidth}px`, 'important');

      clone.querySelectorAll<HTMLElement>('div, section, main, header').forEach((div) => {
        div.style.setProperty('width', `${tableWidth}px`, 'important');
        div.style.setProperty('max-width', `${tableWidth}px`, 'important');
        div.style.setProperty('box-sizing', 'border-box', 'important');
      });

      // Ensure top title bar flex containers don't push title text to the right
      clone.querySelectorAll<HTMLElement>('.justify-between, .justify-start').forEach((el) => {
        el.style.setProperty('justify-content', 'flex-start', 'important');
        el.style.setProperty('gap', '12px', 'important');
      });
    }

    // Ensure title headers wrap automatically onto multiple lines if text is long
    clone.querySelectorAll<HTMLElement>('h1, h2, h3, h4, .text-center').forEach((el) => {
      el.style.setProperty('white-space', 'normal', 'important');
      el.style.setProperty('word-break', 'break-word', 'important');
      el.style.setProperty('overflow-wrap', 'break-word', 'important');
    });

    // Wait another frame for layout to settle after width adjustments
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const rect = clone.getBoundingClientRect();
    const cloneTop = rect.top;
    let maxChildBottom = 0;
    clone.querySelectorAll<HTMLElement>('*').forEach((child) => {
      const b = child.getBoundingClientRect().bottom - cloneTop;
      if (b > maxChildBottom) maxChildBottom = b;
    });

    const width = tableWidth > 0 ? tableWidth : Math.ceil(rect.width || clone.scrollWidth);
    const height = Math.ceil(Math.max(clone.scrollHeight, rect.height, maxChildBottom) + 32);

    const htmlToImage = await import('html-to-image');
    const blob = await htmlToImage.toBlob(clone, {
      pixelRatio: scale,
      backgroundColor: '#ffffff',
      width,
      height,
    });

    if (!blob) throw new Error('html-to-image trả về rỗng.');
    downloadBlob(blob, filename);
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
  groupKey: 'ict' | 'dichvu' | 'ce' | 'all',
  filename: string,
  options: ExportElementOptions = {}
): Promise<Blob | null> {
  const isMobileDevice = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
  const { elementsToHide = ['.export-hide'], scale = isMobileDevice ? 1.5 : 2 } = options;

  const clone = element.cloneNode(true) as HTMLElement;

  elementsToHide.forEach((selector) => {
    clone.querySelectorAll<HTMLElement>(selector).forEach((el) => el.remove());
  });

  // Strip all scrollbars from clone DOM
  suppressScrollbars(clone);

  // Filter columns by data-group attribute if targeting a single group
  if (groupKey !== 'all') {
    clone.querySelectorAll<HTMLElement>('[data-group]').forEach((el) => {
      const elGroup = el.getAttribute('data-group');
      if (elGroup && elGroup !== groupKey) {
        el.remove();
      }
    });
  }

  // Force clone and all child wrapper containers to fit content tightly without extra right padding
  clone.style.setProperty('width', 'max-content', 'important');
  clone.style.setProperty('max-width', 'none', 'important');
  clone.style.setProperty('display', 'inline-block', 'important');

  clone.querySelectorAll<HTMLElement>('div, section, main, header, container, [id*="root"]').forEach((div) => {
    div.style.setProperty('width', 'max-content', 'important');
    div.style.setProperty('max-width', 'none', 'important');
    div.style.setProperty('min-width', 'auto', 'important');
    div.style.setProperty('margin-left', '0', 'important');
    div.style.setProperty('margin-right', '0', 'important');
  });

  // Expand containers and force tight table width fit
  clone.querySelectorAll<HTMLElement>('.overflow-x-auto, .overflow-y-auto, [class*="max-h-"]').forEach((container) => {
    container.style.setProperty('overflow', 'visible', 'important');
    container.style.setProperty('max-height', 'none', 'important');
    container.style.setProperty('height', 'auto', 'important');
    container.style.setProperty('max-width', 'none', 'important');
    container.style.setProperty('width', 'max-content', 'important');
  });

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

  clone.querySelectorAll<HTMLElement>('.max-w-\\[52px\\], .max-w-\\[65px\\], .max-w-\\[50px\\]').forEach((el) => {
    el.style.setProperty('max-width', 'none', 'important');
    el.style.setProperty('width', 'auto', 'important');
  });

  clone.querySelectorAll<HTMLElement>('.sticky').forEach((el) => {
    el.style.setProperty('position', 'static', 'important');
  });

  const captureContainer = document.createElement('div');
  captureContainer.style.position = 'absolute';
  captureContainer.style.left = '-9999px';
  captureContainer.style.top = '0';
  captureContainer.style.width = 'max-content';
  captureContainer.style.maxWidth = 'none';
  captureContainer.style.display = 'inline-block';
  captureContainer.appendChild(clone);
  document.body.appendChild(captureContainer);

  try {
    await document.fonts.ready;
    await waitForImages(clone);
    fixOklchColors(clone);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const tableEl = clone.querySelector('table');
    const tableWidth = tableEl ? Math.ceil(tableEl.getBoundingClientRect().width || tableEl.scrollWidth || tableEl.offsetWidth) : 0;
    
    // Explicitly constrain clone, captureContainer, and all child div containers to tableWidth
    if (tableWidth > 0) {
      clone.style.setProperty('width', `${tableWidth}px`, 'important');
      clone.style.setProperty('max-width', `${tableWidth}px`, 'important');
      clone.style.setProperty('min-width', `${tableWidth}px`, 'important');
      captureContainer.style.setProperty('width', `${tableWidth}px`, 'important');
      captureContainer.style.setProperty('max-width', `${tableWidth}px`, 'important');

      clone.querySelectorAll<HTMLElement>('div, section, main, header, container, [id*="root"]').forEach((div) => {
        div.style.setProperty('width', `${tableWidth}px`, 'important');
        div.style.setProperty('max-width', `${tableWidth}px`, 'important');
        div.style.setProperty('box-sizing', 'border-box', 'important');
      });

      // Ensure top title bar flex containers don't push title text to the right after export-hide elements are removed
      clone.querySelectorAll<HTMLElement>('.justify-between, .justify-start').forEach((el) => {
        el.style.setProperty('justify-content', 'flex-start', 'important');
        el.style.setProperty('gap', '12px', 'important');
      });
    }

    const rect = clone.getBoundingClientRect();
    const cloneTop = rect.top;
    let maxChildBottom = 0;
    clone.querySelectorAll<HTMLElement>('*').forEach((child) => {
      const b = child.getBoundingClientRect().bottom - cloneTop;
      if (b > maxChildBottom) maxChildBottom = b;
    });

    const width = tableWidth > 0 ? tableWidth : Math.ceil(rect.width || clone.scrollWidth);
    const height = Math.ceil(Math.max(clone.scrollHeight, rect.height, maxChildBottom) + 32);

    const htmlToImage = await import('html-to-image');
    const blob = await htmlToImage.toBlob(clone, {
      pixelRatio: scale,
      backgroundColor: '#ffffff',
      width,
      height,
    });

    if (!blob) throw new Error('html-to-image trả về rỗng.');
    downloadBlob(blob, filename);
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
