/**
 * 图片缩略图工具：列表预览用低清图，点击查看才用高清原图（渐进式加载）。
 *
 * 对于带尺寸参数的图源（如 Unsplash `?w=400&q=80`），重写为更小的缩略图参数
 * （webp+低宽+低质量），大幅减少列表首帧网络传输；
 * 无法识别的任意 URL（用户自传图等）直接返回原图，保证不退化。
 */

/** 是否「可缩略」的远程图源（Unsplash 系带 w/q 参数） */
function isThumbnailable(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes('unsplash') || u.hostname.endsWith('unsplash.com');
  } catch {
    return false;
  }
}

/**
 * 返回指定宽度的缩略图 URL；不支持的图源原样返回。
 * @param url  原图 URL
 * @param size 缩略图宽度 px（默认 100，webp + 低质量）
 */
export function thumbUrl(url: string, size = 100): string {
  if (!url) return url;
  if (!isThumbnailable(url)) return url;
  try {
    const u = new URL(url);
    // 覆盖尺寸/质量/格式：webp + 低宽度可显著减小体积（面积约 (size/原宽)²）
    u.searchParams.set('w', String(size));
    u.searchParams.set('q', '50');
    u.searchParams.set('auto', 'format');
    u.searchParams.set('fm', 'webp');
    return u.toString();
  } catch {
    return url;
  }
}