/**
 * 图片上传前自动压缩
 *
 * 将任意图片 File 压缩为指定宽度和质量的 JPEG（或 WebP），
 * 减少 H5 上传传输量和后续列表加载时间。
 * 微信内拍照/选图通常 2~5MB，压缩后 ~100~300KB。
 */

/** 压缩配置 */
interface CompressOptions {
  maxWidth?: number;   // 最大宽度 px（默认 1280）
  maxHeight?: number;  // 最大高度 px（默认 1280）
  quality?: number;    // JPEG 质量 0~1（默认 0.8）
  minWidth?: number;   // 宽度低于此值不压缩（默认 300，缩略图级别不压）
}

/**
 * 把图片 File 压缩为 Blob，返回一个可直接 upload 的新 File。
 * 如果压缩失败或图片太小，原样返回。
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const { maxWidth = 1280, maxHeight = 1280, quality = 0.8, minWidth = 300 } = options;

  // 非 image 类型直接返回
  if (!file.type.startsWith('image/')) return file;

  // GIF 不压缩（动图压缩会丢帧）
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    // 小图不压
    if (bitmap.width <= minWidth && bitmap.height <= minWidth) {
      bitmap.close();
      return file;
    }

    // 计算缩放后的尺寸（按比例缩，不超过 maxWidth/maxHeight）
    let { width: w, height: h } = bitmap;
    if (w > maxWidth) { h = Math.round(h * (maxWidth / w)); w = maxWidth; }
    if (h > maxHeight) { w = Math.round(w * (maxHeight / h)); h = maxHeight; }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }

    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    // 优先 WebP（体积更小），不支持则 JPEG
    const blob = await new Promise<Blob | null>((resolve) => {
      // 先试 WebP
      canvas.toBlob(
        (b) => {
          if (b && b.size > 0) resolve(b);
          else canvas.toBlob(resolve, 'image/jpeg', quality);
        },
        'image/webp',
        quality,
      );
    });

    if (!blob) return file;

    // 如果压缩后反而更大（极小图可能），用原图
    if (blob.size >= file.size) return file;

    // 生成新文件名
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${baseName}.${ext}`, { type: blob.type });
  } catch {
    // 任何异常（createImageBitmap 不支持等）-> 原图返回，不阻断流程
    return file;
  }
}