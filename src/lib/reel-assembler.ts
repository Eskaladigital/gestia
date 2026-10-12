// ============================================
// Montaje del REEL completo en el navegador (vertical 1080×1920, sin audio)
// ============================================
// Une los clips animados de cada escena (Runway / Veo) —o la imagen con un
// movimiento de cámara suave si la escena aún no tiene clip— con fundidos,
// texto por escena, barras de progreso tipo historia, marca arriba y una
// tarjeta final (frase de cierre + marca + CTA). Canvas 2D dibuja cada
// fotograma y WebCodecs (H.264) + mp4-muxer lo empaquetan en MP4 sin pasar por
// el servidor (Vercel no tiene ffmpeg). El audio lo pone el usuario en la red
// social (música de la biblioteca de Instagram).
// Lo usa `ReelAssemblerModal`.

export type ReelScene = {
  /** MP4 del clip animado (si existe). */
  videoUrl?: string | null
  /** Imagen del visual (se usa si no hay clip). */
  imageUrl?: string | null
  /** Texto que aparece en esta escena (se reparte en líneas solo). */
  text: string
}

export type ReelAssembly = {
  scenes: ReelScene[]
  /** Marca arriba y en la tarjeta final (nombre del proyecto). */
  brand: string
  /** Subtítulo bajo la marca en el cierre (p. ej. «CAMPERVANS»). */
  brandSub?: string
  /** Píldora de ubicación sobre la primera escena (opcional). */
  location?: string
  /** Cierre: frase blanca + frase en color de acento. */
  closingA?: string
  closingB?: string
  /** Línea pequeña final (p. ej. «Compártelo con…»). */
  cta?: string
  /** Color de acento (hex). */
  accent?: string
}

export type AssembleOptions = {
  onProgress?: (ratio: number, label?: string) => void
  /** Segundos por escena (los clips más cortos se alargan congelando el final). */
  sceneSeconds?: number
  endSeconds?: number
}

export type AssembleResult = { blob: Blob; mime: string; ext: 'mp4' | 'webm'; durationSec: number }

const W = 1080
const H = 1920
const FPS = 30
const XF = 0.45 // fundido entre escenas
const WHITE = '#ffffff'
const CHAR = '#34363a'

const FONT_BLACK = (s: number) => `800 ${Math.round(s)}px Inter, 'Helvetica Neue', Arial, system-ui, sans-serif`
const FONT_BOLD = (s: number) => `700 ${Math.round(s)}px Inter, 'Helvetica Neue', Arial, system-ui, sans-serif`
const FONT_SEMI = (s: number) => `600 ${Math.round(s)}px Inter, 'Helvetica Neue', Arial, system-ui, sans-serif`

const clamp = (x: number) => Math.max(0, Math.min(1, x))
const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const easeIO = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x)
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)

function rgba(hex: string, a: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const n = m ? parseInt(m[1], 16) : 0xf26b3a
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w
    if (ctx.measureText(t).width <= maxW || !cur) cur = t
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines
}

/** Baja el cuerpo hasta que la frase cabe entera. No se corta el final. */
function fitWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  start: number,
  min: number,
  maxLines: number,
  weight: 'black' | 'bold',
): { lines: string[]; size: number } {
  const fontOf = (s: number) => (weight === 'black' ? FONT_BLACK(s) : FONT_BOLD(s))
  let size = start
  let lines: string[] = []
  while (size >= min) {
    ctx.font = fontOf(size)
    lines = wrap(ctx, text, maxW)
    if (lines.length <= maxLines) return { lines, size }
    size -= 4
  }
  ctx.font = fontOf(min)
  return { lines: wrap(ctx, text, maxW).slice(0, maxLines), size: min }
}

function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, sp: number) {
  ctx.textAlign = 'left'
  let cx = x
  for (const ch of text) {
    ctx.fillText(ch, cx, y)
    cx += ctx.measureText(ch).width + sp
  }
  return cx - x - sp
}

/** Las dos franjas (acento + gris) que subrayan cada frase. */
function stripes(ctx: CanvasRenderingContext2D, accent: string, x: number, y: number, w: number, p: number) {
  if (p <= 0) return
  const L = w * easeOut(p)
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + L, y)
  ctx.lineTo(x + L - 14, y + 12)
  ctx.lineTo(x - 14, y + 12)
  ctx.fill()
  ctx.fillStyle = CHAR
  ctx.beginPath()
  ctx.moveTo(x, y + 22)
  ctx.lineTo(x + L * 0.7, y + 22)
  ctx.lineTo(x + L * 0.7 - 14, y + 34)
  ctx.lineTo(x - 14, y + 34)
  ctx.fill()
}

// ---------- fuentes de imagen por escena ----------

type Source =
  | { kind: 'video'; el: HTMLVideoElement; duration: number; url: string }
  | { kind: 'image'; el: HTMLImageElement }

async function loadVideo(url: string): Promise<Source> {
  // Blob local: evita problemas de rango/CORS al buscar fotograma a fotograma.
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo descargar un clip (${res.status})`)
  const blobUrl = URL.createObjectURL(await res.blob())
  const el = document.createElement('video')
  el.muted = true
  el.playsInline = true
  el.preload = 'auto'
  el.src = blobUrl
  await new Promise<void>((resolve, reject) => {
    el.onloadeddata = () => resolve()
    el.onerror = () => reject(new Error('Un clip no se pudo leer'))
  })
  return { kind: 'video', el, duration: el.duration || 5, url: blobUrl }
}

async function loadImage(url: string): Promise<Source> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`No se pudo descargar una imagen (${res.status})`)
  const blobUrl = URL.createObjectURL(await res.blob())
  const el = new Image()
  el.src = blobUrl
  await el.decode()
  return { kind: 'image', el }
}

async function seek(el: HTMLVideoElement, t: number) {
  const target = Math.max(0, Math.min(t, (el.duration || 0) - 0.04))
  if (Math.abs(el.currentTime - target) < 0.004) return
  await new Promise<void>((resolve) => {
    const done = () => {
      el.removeEventListener('seeked', done)
      resolve()
    }
    el.addEventListener('seeked', done)
    el.currentTime = target
  })
}

/** Dibuja la fuente cubriendo 1080×1920 (recorte centrado) con zoom z. */
function drawCover(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, sh: number, z: number, panX = 0) {
  const scale = Math.max(W / sw, H / sh) * z
  const dw = sw * scale
  const dh = sh * scale
  const maxPan = Math.max(0, (dw - W) / 2)
  ctx.drawImage(src, (W - dw) / 2 + panX * maxPan, (H - dh) / 2, dw, dh)
}

// ---------- encoder ----------

async function pickEncoderConfig(): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null
  // H.264 primero (Instagram y todos los móviles); VP9 como respaldo (Chromium sin H.264).
  const candidates = ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.640033', 'vp09.00.40.08', 'vp09.00.41.08']
  for (const codec of candidates) {
    const cfg: VideoEncoderConfig = { codec, width: W, height: H, bitrate: 10_000_000, framerate: FPS }
    try {
      const r = await VideoEncoder.isConfigSupported(cfg)
      if (r.supported) return cfg
    } catch {
      /* siguiente */
    }
  }
  return null
}

// ---------- montaje ----------

export async function assembleReel(data: ReelAssembly, opts: AssembleOptions = {}): Promise<AssembleResult> {
  const scenes = data.scenes.filter((s) => s.videoUrl || s.imageUrl)
  if (scenes.length === 0) throw new Error('No hay escenas con imagen o clip')
  const accent = data.accent || '#f26b3a'
  const sceneSec = opts.sceneSeconds ?? 3.4
  const endSec = opts.endSeconds ?? 3.0

  try {
    await Promise.all([
      document.fonts.load(FONT_BLACK(90)),
      document.fonts.load(FONT_BOLD(60)),
      document.fonts.load(FONT_SEMI(36)),
    ])
  } catch {
    /* fallback de sistema */
  }

  opts.onProgress?.(0, 'Descargando clips…')
  const sources: Source[] = []
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i]
    sources.push(s.videoUrl ? await loadVideo(s.videoUrl) : await loadImage(s.imageUrl as string))
    opts.onProgress?.(((i + 1) / scenes.length) * 0.1, 'Descargando clips…')
  }

  const starts: number[] = []
  let acc = 0
  for (let i = 0; i < scenes.length; i++) {
    starts.push(acc)
    acc += sceneSec
  }
  const textEnd = acc
  const total = acc + endSec
  const NF = Math.round(total * FPS)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d', { alpha: false })!
  const layer = document.createElement('canvas') // escena siguiente para el fundido
  layer.width = W
  layer.height = H
  const lctx = layer.getContext('2d', { alpha: false })!

  // Líneas de texto por escena (se calculan una vez). El cuerpo baja si hace falta
  // para que la frase quepa entera: cortarla a media línea deja el reel sin mensaje.
  const sceneLines = scenes.map((s) => {
    const short = s.text.trim().length <= 44
    return fitWrapped(ctx, s.text, W - 170, short ? 92 : 68, 46, 4, short ? 'black' : 'bold')
  })

  async function drawScene(c: CanvasRenderingContext2D, i: number, t: number) {
    const src = sources[i]
    // El clip arranca a moverse ya durante el fundido de entrada.
    const lt = Math.max(0, t - starts[i] + (i > 0 ? XF : 0))
    const isLast = i === scenes.length - 1
    if (src.kind === 'video') {
      const d = src.duration
      if (lt < d - 0.05) {
        await seek(src.el, lt)
        drawCover(c, src.el, src.el.videoWidth, src.el.videoHeight, 1)
      } else {
        // Clip más corto que la escena: último fotograma con zoom lento.
        await seek(src.el, d)
        drawCover(c, src.el, src.el.videoWidth, src.el.videoHeight, 1 + 0.02 * (lt - d))
      }
    } else {
      const span = sceneSec + XF + (isLast ? endSec : 0)
      const p = easeIO(clamp(lt / span))
      drawCover(c, src.el, src.el.naturalWidth, src.el.naturalHeight, 1.04 + 0.1 * p, (i % 2 ? 1 : -1) * (0.5 - p) * 0.6)
    }
  }

  function overlay(t: number, i: number) {
    // degradados de legibilidad (abajo y arriba)
    const g = ctx.createLinearGradient(0, 900, 0, H)
    g.addColorStop(0, 'rgba(12,12,14,0)')
    g.addColorStop(1, 'rgba(12,12,14,0.78)')
    ctx.fillStyle = g
    ctx.fillRect(0, 900, W, H - 900)
    const g2 = ctx.createLinearGradient(0, 0, 0, 300)
    g2.addColorStop(0, 'rgba(12,12,14,0.35)')
    g2.addColorStop(1, 'rgba(12,12,14,0)')
    ctx.fillStyle = g2
    ctx.fillRect(0, 0, W, 300)

    // barras de progreso
    const n = scenes.length
    const gw = (W - 160 - (n - 1) * 10) / n
    for (let k = 0; k < n; k++) {
      const x0 = 80 + k * (gw + 10)
      ctx.fillStyle = 'rgba(255,255,255,0.45)'
      ctx.fillRect(x0, 110, gw, 6)
      const f = clamp((t - starts[k]) / sceneSec)
      if (f > 0) {
        ctx.fillStyle = WHITE
        ctx.fillRect(x0, 110, gw * f, 6)
      }
    }

    // marca + ubicación
    ctx.globalAlpha = prog(t, 0.2, 0.8)
    ctx.fillStyle = WHITE
    ctx.font = FONT_BOLD(30)
    ctx.textBaseline = 'top'
    spaced(ctx, data.brand.toUpperCase(), 80, 150, 7)
    ctx.globalAlpha = 1
    if (data.location) {
      const pa = prog(t, 0.5, 1.0) * (1 - prog(t, (starts[1] ?? sceneSec) - 0.3, starts[1] ?? sceneSec))
      if (pa > 0) {
        ctx.font = FONT_BOLD(30)
        const loc = data.location.toUpperCase()
        let tw = 0
        for (const ch of loc) tw += ctx.measureText(ch).width + 3
        ctx.globalAlpha = pa
        ctx.fillStyle = accent
        ctx.beginPath()
        ctx.roundRect(80, 205, tw + 40, 50, 25)
        ctx.fill()
        ctx.fillStyle = WHITE
        spaced(ctx, loc, 100, 214, 3)
        ctx.globalAlpha = 1
      }
    }

    // texto de la escena
    if (t < textEnd) {
      const lt = t - starts[i]
      const { lines, size } = sceneLines[i]
      const lh = Math.round(size * 1.08)
      const baseY = 1420 - lines.length * lh
      const out = prog(lt, sceneSec - 0.35, sceneSec - 0.05)
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.font = size >= 78 ? FONT_BLACK(size) : FONT_BOLD(size)
      lines.forEach((ln, k) => {
        const p = easeOut(prog(lt, 0.3 + k * 0.13, 0.75 + k * 0.13))
        if (p <= 0) return
        const a = p * (1 - out)
        const y = baseY + k * lh + (1 - p) * 46 - out * 20
        ctx.globalAlpha = a * 0.45
        ctx.fillStyle = '#000'
        ctx.fillText(ln, 84, y + 4)
        ctx.globalAlpha = a
        ctx.fillStyle = WHITE
        ctx.fillText(ln, 80, y)
      })
      ctx.globalAlpha = 1
      if (lines.length) {
        stripes(ctx, accent, 84, baseY + lines.length * lh + 26, 300, prog(lt, 0.55 + lines.length * 0.13, 1.1 + lines.length * 0.13) * (1 - out))
      }
    } else {
      endCard(t - textEnd)
    }
  }

  function endCard(et: number) {
    ctx.fillStyle = `rgba(10,10,12,${0.6 * easeIO(prog(et, 0, 0.6))})`
    ctx.fillRect(0, 0, W, H)
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    let y = 560
    const fade = (a: number, b: number) => easeOut(prog(et, a, b))
    const laFit = data.closingA ? fitWrapped(ctx, data.closingA, W - 170, 64, 40, 4, 'bold') : { lines: [] as string[], size: 64 }
    const lbFit = data.closingB ? fitWrapped(ctx, data.closingB, W - 170, 64, 40, 3, 'bold') : { lines: [] as string[], size: 64 }
    const la = laFit.lines
    const lb = lbFit.lines
    ctx.font = FONT_BOLD(laFit.size)
    la.forEach((ln, k) => {
      const p = fade(0.25 + k * 0.1, 0.65 + k * 0.1)
      if (p > 0) {
        ctx.globalAlpha = p
        ctx.fillStyle = WHITE
        ctx.fillText(ln, 80, y + (1 - p) * 40)
      }
      y += Math.round(laFit.size * 1.12)
    })
    y += 20
    ctx.font = FONT_BOLD(lbFit.size)
    lb.forEach((ln, k) => {
      const p = fade(0.75 + k * 0.1, 1.15 + k * 0.1)
      if (p > 0) {
        ctx.globalAlpha = p
        ctx.fillStyle = accent
        ctx.fillText(ln, 80, y + (1 - p) * 40)
      }
      y += Math.round(lbFit.size * 1.12)
    })
    const bp = fade(1.4, 1.9)
    if (bp > 0) {
      const by = Math.max(y + 90, 1150) + (1 - bp) * 60
      ctx.globalAlpha = 1
      stripes(ctx, accent, 84, by - 50, 420, prog(et, 1.4, 2.0))
      ctx.globalAlpha = bp
      let fs = 120
      ctx.font = FONT_BLACK(fs)
      while (ctx.measureText(data.brand.toUpperCase()).width > W - 160 && fs > 60) {
        fs -= 6
        ctx.font = FONT_BLACK(fs)
      }
      ctx.fillStyle = WHITE
      ctx.fillText(data.brand.toUpperCase(), 76, by)
      if (data.brandSub) {
        ctx.font = FONT_BOLD(30)
        ctx.fillStyle = accent
        spaced(ctx, data.brandSub.toUpperCase(), 84, by + fs * 1.15, 12)
      }
    }
    const sp = prog(et, 2.1, 2.5)
    if (sp > 0 && data.cta) {
      ctx.globalAlpha = sp * 0.9
      ctx.font = FONT_SEMI(36)
      ctx.fillStyle = WHITE
      wrap(ctx, data.cta, W - 170)
        .slice(0, 3)
        .forEach((ln, k) => ctx.fillText(ln, 80, 1440 + k * 46))
    }
    ctx.globalAlpha = 1
  }

  async function frameAt(fi: number) {
    const t = fi / FPS
    let i = 0
    for (let k = 0; k < starts.length; k++) if (t >= starts[k]) i = k
    await drawScene(ctx, i, t)
    if (i + 1 < scenes.length && t > starts[i + 1] - XF) {
      await drawScene(lctx, i + 1, t)
      ctx.globalAlpha = easeIO(prog(t, starts[i + 1] - XF, starts[i + 1]))
      ctx.drawImage(layer, 0, 0)
      ctx.globalAlpha = 1
    }
    if (t < 0.35) {
      ctx.fillStyle = `rgba(12,12,14,${1 - easeIO(t / 0.35)})`
      ctx.fillRect(0, 0, W, H)
    }
    overlay(t, i)
    if (t > total - 0.3) {
      ctx.fillStyle = `rgba(12,12,14,${prog(t, total - 0.3, total)})`
      ctx.fillRect(0, 0, W, H)
    }
  }

  const cleanup = () => {
    for (const s of sources) {
      if (s.kind === 'video') URL.revokeObjectURL(s.url)
      else URL.revokeObjectURL(s.el.src)
    }
  }

  try {
    const cfg = await pickEncoderConfig()
    if (cfg) {
      const { Muxer, ArrayBufferTarget } = await import('mp4-muxer')
      const muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: cfg.codec.startsWith('avc') ? 'avc' : 'vp9', width: W, height: H, frameRate: FPS },
        fastStart: 'in-memory',
      })
      let failure: unknown = null
      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          failure = e
        },
      })
      encoder.configure(cfg)
      for (let fi = 0; fi < NF; fi++) {
        if (failure) throw failure
        await frameAt(fi)
        const frame = new VideoFrame(canvas, { timestamp: Math.round((fi * 1e6) / FPS), duration: Math.round(1e6 / FPS) })
        encoder.encode(frame, { keyFrame: fi % (FPS * 2) === 0 })
        frame.close()
        while (encoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 4))
        if (fi % 6 === 0) opts.onProgress?.(0.1 + 0.9 * (fi / NF), 'Montando el reel…')
      }
      await encoder.flush()
      encoder.close()
      if (failure) throw failure
      muxer.finalize()
      opts.onProgress?.(1, 'Listo')
      return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), mime: 'video/mp4', ext: 'mp4', durationSec: total }
    }

    // Plan B (sin WebCodecs): MediaRecorder en tiempo real.
    const mime = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(
      (m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m),
    )
    if (!mime) throw new Error('Este navegador no puede generar vídeo. Usa Chrome o Edge actualizados.')
    const stream = canvas.captureStream(FPS)
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    const done = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.start(250)
    for (let fi = 0; fi < NF; fi++) {
      const t0 = performance.now()
      await frameAt(fi)
      opts.onProgress?.(0.1 + 0.9 * (fi / NF), 'Montando el reel…')
      const wait = 1000 / FPS - (performance.now() - t0)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    }
    rec.stop()
    await done
    const type = mime.split(';')[0]
    return { blob: new Blob(chunks, { type }), mime: type, ext: type === 'video/mp4' ? 'mp4' : 'webm', durationSec: total }
  } finally {
    cleanup()
  }
}

const DANGLING_LAST =
  /^(de|del|al|la|el|los|las|un|una|unos|unas|que|y|o|e|u|a|en|con|por|para|sin|sobre|lo|su|sus|tu|tus|mi|mis|te|se|me|nos|os|es|son|está|están|ser|estar|hace|hay|como|porque|cuando|donde|dónde|deja|dejan|pasa|pasan|parte)$/i

const FINITE =
  /\b(es|son|está|están|estás|estoy|estamos|era|fueron|hace|hacen|tiene|tienen|puede|pueden|significa|dejas|deja|dejan|pasa|pasan|empieza|empiezan|nota|notas|aparece|aparecen|hay|soy|somos|sientes|siente|quieres|quiero|recalcula)\b/i

const GERUND = /\b\p{L}+(ando|endo)\b/iu

function wordsOf(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean)
}

function lastWord(s: string): string {
  const w = wordsOf(s.replace(/[«»"'“”]+/g, ''))
  return (w[w.length - 1] || '').replace(/[.,;:!?…]+$/g, '')
}

function capFirst(t: string): string {
  const m = t.match(/^([¿¡"«]*)(\p{L})/u)
  if (!m || m.index === undefined) return t
  return t.slice(0, m.index + m[1].length) + m[2].toUpperCase() + t.slice(m.index + m[0].length)
}

/** True si el rótulo está cortado: puntos suspensivos o se queda en «de», «ser», «que»… */
export function captionLooksCut(text: string): boolean {
  const t = (text || '').trim()
  if (!t) return false
  if (/…|\.{3}/.test(t)) return true
  return DANGLING_LAST.test(lastWord(t))
}

function tidyLine(raw: string): string {
  let t = raw
    .replace(/[«»“”]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[,;:\s]+|[,;:\s]+$/g, '')
    .trim()
  t = t.replace(/[…]+/g, '').replace(/\.{2,}/g, '').replace(/^(y|o|e|u|pero)\s+/i, '').trim()
  if (!t) return ''
  if (!/[.!?]$/.test(t)) t += '.'
  return capFirst(t)
}

/** Frase que se puede poner en pantalla. Vacío si viene cortada o se queda a medias. */
export function acceptCaption(text: string, maxWords = 18): string {
  const raw = (text || '').trim()
  if (!raw || /…|\.{3}/.test(raw)) return ''
  const t = tidyLine(raw)
  const n = wordsOf(t).length
  const question = /\?$/.test(t)
  if (n < (question ? 2 : 3) || n > maxWords) return ''
  if (captionLooksCut(t)) return ''
  return t
}

/** Trozo del copy: además tiene que ser una oración, no un recorte de coma. */
function acceptClause(text: string, maxWords: number): string {
  const t = acceptCaption(text, maxWords)
  if (!t || wordsOf(t).length < 4) return ''
  if (/\?$/.test(t)) return t
  if (GERUND.test(t) && !FINITE.test(t)) return ''
  if (!FINITE.test(t)) return ''
  return t
}

function beatsInSentence(sentence: string): string[] {
  const quotes: string[] = []
  const stripped = sentence
    .replace(/[«"“]([^»"”]+)[»"”]/g, (_, q) => {
      quotes.push(String(q))
      return ' '
    })
    .replace(/\s+/g, ' ')
    .trim()
  const out: string[] = []
  const whole = acceptClause(stripped, 18)
  if (whole) out.push(whole)
  else {
    for (const part of stripped.split(/\s*[,;:]\s*/)) {
      const line = acceptClause(part, 14)
      if (line) out.push(line)
    }
  }
  for (const q of quotes) {
    const line = acceptCaption(q, 12)
    if (line && !out.includes(line)) out.push(line)
  }
  return out
}

function beatsFromCopy(copy: string): string[] {
  const clean = (copy || '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+\n/g, '\n')
    .trim()
  if (!clean) return []
  const sentences = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3)
  const beats: string[] = []
  for (const sentence of sentences) {
    for (const beat of beatsInSentence(sentence)) {
      if (!beats.includes(beat)) beats.push(beat)
    }
  }
  return beats
}

/**
 * Reparte el copy en rótulos que se leen enteros.
 * Nunca corta a ocho palabras ni añade «…»: una frase a medias no dice nada en pantalla.
 */
export function suggestSceneTexts(
  copy: string,
  n: number,
  ctaFromPost = '',
): { scenes: string[]; closingA: string; closingB: string; cta: string } {
  const beats = beatsFromCopy(copy)
  const count = Math.max(0, n)
  const scenes = Array.from({ length: count }, (_, i) => beats[i] || '')
  const rest = beats.slice(count)
  const cta =
    (ctaFromPost || '')
      .split(/(?<=[.!?])\s+/)
      .map((s) => acceptCaption(s, 16))
      .find(Boolean) || ''
  return {
    scenes,
    closingA: rest[0] || '',
    closingB: rest.length > 1 ? rest[rest.length - 1] : '',
    cta,
  }
}
