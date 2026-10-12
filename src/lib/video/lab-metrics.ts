'use client';

/** Métricas de un clip en el navegador: ~12 fotogramas, sin ffmpeg. */

function mad(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let s = 0;
  const px = a.length / 4;
  for (let i = 0; i < a.length; i += 16) {
    s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  }
  const samples = Math.ceil(a.length / 16);
  return s / (samples * 3 * 255);
}

function seekTo(video: HTMLVideoElement, t: number) {
  return new Promise<void>((resolve, reject) => {
    const onOk = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error('No se pudo leer un fotograma del clip'));
    };
    const cleanup = () => {
      video.removeEventListener('seeked', onOk);
      video.removeEventListener('error', onErr);
    };
    video.addEventListener('seeked', onOk);
    video.addEventListener('error', onErr);
    video.currentTime = Math.min(Math.max(0, t), Math.max(0, (video.duration || 1) - 0.05));
  });
}

export type ClipMetrics = {
  movimiento: number;
  fidelidad: number;
  estabilidad: number;
  frames: string[];
};

export async function measureClip(videoUrl: string, imageUrl: string): Promise<ClipMetrics> {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = videoUrl;
  await new Promise<void>((resolve, reject) => {
    video.onloadeddata = () => resolve();
    video.onerror = () => reject(new Error('No se pudo cargar el clip (CORS o URL)'));
  });

  const w = 64;
  const h = 114;
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  if (!sctx) throw new Error('Canvas no disponible');

  const thumb = document.createElement('canvas');
  thumb.width = 270;
  thumb.height = 480;
  const tctx = thumb.getContext('2d');
  if (!tctx) throw new Error('Canvas no disponible');

  const n = 12;
  const frames: Uint8ClampedArray[] = [];
  const thumbs: string[] = [];
  const dur = video.duration || 5;
  for (let i = 0; i < n; i++) {
    await seekTo(video, (dur * i) / (n - 1) * 0.96);
    sctx.drawImage(video, 0, 0, w, h);
    frames.push(new Uint8ClampedArray(sctx.getImageData(0, 0, w, h).data));
    if (thumbs.length < 6 && i % 2 === 0) {
      tctx.drawImage(video, 0, 0, thumb.width, thumb.height);
      thumbs.push(thumb.toDataURL('image/jpeg', 0.6));
    }
  }

  const diffs: number[] = [];
  for (let i = 1; i < frames.length; i++) diffs.push(mad(frames[i], frames[i - 1]));
  const mean = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length);
  const peak = Math.max(...diffs, 0);
  const spike = peak / (mean + 0.01);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('No se pudo cargar la imagen original'));
    img.src = imageUrl;
  });
  sctx.drawImage(img, 0, 0, w, h);
  const src = sctx.getImageData(0, 0, w, h).data;
  const fidelity = Math.max(0, Math.min(1, 1 - mad(frames[0], src)));

  return {
    movimiento: Math.round(mean * 1000) / 1000,
    fidelidad: Math.round(fidelity * 1000) / 1000,
    estabilidad: Math.round((1 / (1 + Math.max(0, spike - 2))) * 1000) / 1000,
    frames: thumbs,
  };
}
