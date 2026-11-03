/**
 * 视频压缩工具
 * 使用 Canvas + MediaRecorder API 将视频压缩到目标大小以内
 * 原理：将视频逐帧绘制到 Canvas，通过 MediaRecorder 以较低码率重新录制
 */

const TARGET_SIZE_MB = 15; // 目标压缩大小上限
const MAX_WIDTH = 1280; // 最大宽度（超过则等比缩小）
const MAX_FPS = 30; // 录制帧率

/** 获取浏览器支持的 MediaRecorder mimeType */
function getSupportedMimeType(): string {
  const types = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return 'video/webm';
}

/**
 * 压缩视频文件到目标大小以内
 * @param file 原始视频文件
 * @param targetSizeMB 目标大小（MB），默认 50MB
 * @param onProgress 进度回调 (0-1)
 * @returns 压缩后的 File 对象（如果原始文件已在目标大小内则直接返回）
 */
export async function compressVideo(
  file: File,
  targetSizeMB: number = TARGET_SIZE_MB,
  onProgress?: (progress: number) => void,
): Promise<File> {
  // 原始文件已在目标大小内，无需压缩
  if (file.size <= targetSizeMB * 1024 * 1024) {
    onProgress?.(1);
    return file;
  }

  // iOS WKWebView 不支持 MediaRecorder / canvas.captureStream，直接返回原文件
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    onProgress?.(1);
    return file;
  }

  // 创建 video 元素加载原始视频
  const video = document.createElement('video');
  video.src = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('视频加载失败'));
  });

  const duration = video.duration;
  if (!duration || !isFinite(duration)) {
    URL.revokeObjectURL(video.src);
    onProgress?.(1);
    return file; // 无法获取时长，跳过压缩
  }

  // 计算目标码率：使最终文件大小接近 targetSizeMB
  // 码率(bps) = 文件大小(bytes) * 8 / 时长(s)
  const targetBitrate = Math.min(
    (targetSizeMB * 1024 * 1024 * 8) / duration,
    2_500_000, // 上限 2.5Mbps，避免过高码率
  );

  // 等比缩小尺寸
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const canvasWidth = Math.round(video.videoWidth * scale);
  const canvasHeight = Math.round(video.videoHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    URL.revokeObjectURL(video.src);
    onProgress?.(1);
    return file;
  }

  // Canvas 视频流
  const canvasStream = canvas.captureStream(MAX_FPS);

  // 尝试从 video 元素捕获音频轨道
  try {
    const videoStream = (video as any).captureStream
      ? (video as any).captureStream()
      : (video as any).mozCaptureStream
        ? (video as any).mozCaptureStream()
        : null;
    if (videoStream) {
      videoStream.getAudioTracks().forEach((track: MediaStreamTrack) => {
        canvasStream.addTrack(track);
      });
    }
  } catch {
    // 音频捕获失败不影响视频压缩
  }

  const mimeType = getSupportedMimeType();
  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: targetBitrate,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  const done = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });

  recorder.start();
  video.play();

  // 逐帧绘制 + 进度回调
  function drawFrame() {
    if (video.ended || video.paused) {
      if (recorder.state !== 'inactive') recorder.stop();
      return;
    }
    ctx.drawImage(video, 0, 0, canvasWidth, canvasHeight);
    if (onProgress && duration > 0) {
      onProgress(Math.min(video.currentTime / duration, 0.99));
    }
    requestAnimationFrame(drawFrame);
  }
  drawFrame();

  const blob = await done;
  URL.revokeObjectURL(video.src);
  onProgress?.(1);

  const ext = mimeType.includes('webm') ? '.webm' : '.mp4';
  const baseName = file.name.replace(/\.[^.]+$/, '');
  const compressedFile = new File([blob], `${baseName}${ext}`, { type: blob.type });

  // 如果压缩后仍超过目标大小，以更小的目标递归压缩一次
  if (compressedFile.size > targetSizeMB * 1024 * 1024 && targetSizeMB > 5) {
    return compressVideo(compressedFile, targetSizeMB * 0.6, onProgress);
  }

  return compressedFile;
}
