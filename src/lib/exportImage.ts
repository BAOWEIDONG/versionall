/**
 * 报告导出工具（长图）
 *
 * html2canvas-pro 渲染报告 DOM（支持 Tailwind v4 的 oklch 颜色，原版 html2canvas 不支持会抛错）。
 * - 微信内置浏览器：生成 PNG 后全屏预览，提示长按保存（微信不支持 a[download]）
 * - 普通浏览器：生成 PNG 并触发下载
 * - 失败时降级 window.print()
 *
 * 性能：html2canvas-pro 体积较大，点击导出时才动态 import，首次加载后缓存复用。
 */
import { showToast, showImagePreview } from 'vant';

export type ExportMode = 'image' | 'print';

let html2canvasPromise: Promise<typeof import('html2canvas-pro')> | null = null;

function loadHtml2Canvas() {
  if (!html2canvasPromise) html2canvasPromise = import('html2canvas-pro');
  return html2canvasPromise;
}

/** 是否在微信内置浏览器 */
export const isWeChat = (): boolean => /MicroMessenger/i.test(navigator.userAgent);

/** 高清渲染倍数：目标 2x，若报告过长按 iOS 画布像素上限自适应下调（最低 1.5x） */
const renderScaleOf = (el: HTMLElement): number => {
  const w = el.scrollWidth || el.offsetWidth || 375;
  const h = el.scrollHeight || el.offsetHeight || 800;
  const area = Math.max(w * h, 1);
  const MAX_PIXELS = 16_000_000;
  if (area * 4 <= MAX_PIXELS) return 2;
  const adaptive = Math.sqrt(MAX_PIXELS / area);
  return Math.min(2, Math.max(1.5, Math.floor(adaptive * 10) / 10));
};

/**
 * 把指定元素导出为 PNG 长图。
 * @returns 实际使用的导出模式
 */
export async function exportElementAsImage(
  el: HTMLElement,
  filename: string,
): Promise<ExportMode> {
  showToast({ message: '正在生成图片，请稍候…', duration: 1500 });
  try {
    const { default: html2canvas } = await loadHtml2Canvas();
    const canvas = await html2canvas(el, {
      scale: renderScaleOf(el),
      useCORS: true,
      backgroundColor: '#F7F8FA',
      logging: false,
    });
    const url = canvas.toDataURL('image/png');

    if (isWeChat()) {
      // 微信内无法直接下载文件，改为全屏预览，长按保存到相册
      showToast({ message: '长按图片可保存到相册', duration: 2500 });
      showImagePreview({ images: [url], closeable: true });
    } else {
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = url;
      link.click();
      showToast({ message: '长图已生成', duration: 2000 });
    }
    return 'image';
  } catch (e) {
    console.error('长图导出失败，回退打印', e);
    showToast({ message: '长图生成失败，已切换为打印导出', duration: 2000 });
    setTimeout(() => window.print(), 400);
    return 'print';
  }
}
