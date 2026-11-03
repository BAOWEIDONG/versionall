/**
 * 报告导出工具（PDF 版）
 *
 * html2canvas-pro 渲染报告 DOM（支持 Tailwind v4 的 oklch 颜色，原版 html2canvas 不支持会抛错），
 * jsPDF 按 A4 宽度分页写入图片，直接生成多页 PDF 下载。不使用 window.print 降级。
 *
 * 性能优化：html2canvas-pro 与 jsPDF 均体积较大，改为「点击导出时才动态 import」，
 * 避免打入启动主包，显著降低首屏/导航首载体积。首次加载后缓存复用，同一会话多次导出不重复拉取。
 */
import { showToast, showImagePreview } from 'vant';

let html2canvasPromise: Promise<typeof import('html2canvas-pro')> | null = null;
let jspdfPromise: Promise<typeof import('jspdf')> | null = null;

/** 按需加载截图库（缓存复用） */
function loadHtml2canvas() {
  if (!html2canvasPromise) html2canvasPromise = import('html2canvas-pro');
  return html2canvasPromise;
}
/** 按需加载 PDF 库（缓存复用） */
function loadJsPDF() {
  if (!jspdfPromise) jspdfPromise = import('jspdf');
  return jspdfPromise;
}

/** 是否在微信内置浏览器（安卓/iOS 均不触发 a[download] 文件下载，只能长按保存图片） */
export const isWeChat = (): boolean =>
  /MicroMessenger/i.test(navigator.userAgent);

/**
 * 高清渲染缩放倍数：目标 3x；若报告面积过大（超长页）按 iOS Safari 画布
 * 像素上限（约 1600 万像素）自适应下调，最低 2x，避免 canvas 创建失败白屏。
 */
const renderScaleOf = (el: HTMLElement): number => {
  const w = el.scrollWidth || el.offsetWidth;
  const h = el.scrollHeight || el.offsetHeight;
  const area = Math.max(w * h, 1);
  const MAX_PIXELS = 16_000_000;
  if (area * 9 <= MAX_PIXELS) return 3;
  const adaptive = Math.sqrt(MAX_PIXELS / area);
  return Math.min(3, Math.max(2, Math.floor(adaptive * 10) / 10));
};

/**
 * 报告导出统一入口（自动适配环境）：
 * - 普通浏览器：生成 A4 分页 PDF 下载；
 * - 微信内置浏览器：生成 PNG 长图并全屏预览，提示长按保存（微信无法直接下载文件，
 *   但 <img> 支持长按保存到相册，安卓/iOS 一致）。
 */
export async function exportReport(el: HTMLElement, filename: string): Promise<void> {
  if (isWeChat()) {
    showToast({ message: '正在生成长图…', duration: 1200 });
    try {
      const { default: html2canvas } = await loadHtml2canvas();
      const canvas = await html2canvas(el, {
        scale: renderScaleOf(el),
        useCORS: true,
        backgroundColor: '#F7F8FA',
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      showToast({ message: '长按图片可保存到相册', duration: 2500 });
      showImagePreview({ images: [url], closeable: true });
    } catch (e) {
      console.error('微信长图导出失败', e);
      showToast({ message: '生成失败，请重试', duration: 2500 });
    }
    return;
  }
  await exportElementAsPDF(el, filename);
}

/**
 * 把指定元素导出为 A4 分页 PDF 并触发下载。
 */
export async function exportElementAsPDF(
  el: HTMLElement,
  filename: string,
): Promise<boolean> {
  showToast({ message: '正在生成 PDF，请稍候…', duration: 1500 });
  try {
    const { default: html2canvas } = await loadHtml2canvas();
    const canvas = await html2canvas(el, {
      scale: renderScaleOf(el), // 高清渲染（自适应防超 iOS 画布上限）
      useCORS: true,
      backgroundColor: '#F7F8FA',
      logging: false,
    });

    // A4 竖版：210 x 297 mm
    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height / canvas.width) * imgWidth;

    const { jsPDF } = await loadJsPDF();
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    } else {
      // 长图按 A4 高度切片分页
      let remaining = imgHeight;
      let position = 0;
      while (remaining > 0) {
        if (position > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, -position, imgWidth, imgHeight);
        position += pageHeight;
        remaining -= pageHeight;
      }
    }

    pdf.save(`${filename}.pdf`);
    showToast({ message: 'PDF 已生成', duration: 2500 });
    return true;
  } catch (e) {
    console.error('PDF 导出失败', e);
    showToast({ message: 'PDF 生成失败，请重试', duration: 2500 });
    return false;
  }
}
