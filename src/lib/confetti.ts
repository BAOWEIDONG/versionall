/**
 * 全屏迸发庆典特效 v3 - 纯 Canvas + DOM，零依赖
 *
 * 性能策略：
 * - DPR 固定 1，避免高分屏像素爆炸
 * - 分批渲染：rect 用 fillRect（无 transform），circle 用 arc（无 transform），
 *   仅 star/sparkle 用 save/restore（占比 <15%）
 * - 无拖尾、无 shadowBlur、无 per-particle filter
 * - 全量粒子预创建 + delay 字段，避免动画中数组扩容
 *
 * 视觉策略：
 * - 5 个爆发点遍布全屏 + 顶部金箔雨 + 两侧礼花炮
 * - 开头 3 帧主题色全屏闪
 */

type CheckinType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'exercise' | 'weight';

// ─── 主题 ─────────────────────────────────────────
interface Theme {
  colors: string[];
  accent: string;
  accentLight: string;
  cardBg: string;
  emoji: string;
  messages: string[];
}

const THEMES: Record<CheckinType, Theme> = {
  breakfast: {
    colors: ['#FFD700', '#FFA500', '#FFB627', '#FFE4B5', '#FF8C42', '#FFCB6B'],
    accent: '#FF8C00', accentLight: 'rgba(255,140,0,0.12)',
    cardBg: 'linear-gradient(135deg,rgba(255,255,255,0.95) 0%,rgba(255,248,231,0.9) 50%,rgba(255,228,181,0.85) 100%)',
    emoji: '🌅', messages: ['元气早晨', '早餐打卡成功', '美好一天开始了', '清晨的能量'],
  },
  lunch: {
    colors: ['#07C160', '#6BCB77', '#4ADE80', '#FCC419', '#51CF66', '#FFD93D'],
    accent: '#07C160', accentLight: 'rgba(7,193,96,0.10)',
    cardBg: 'linear-gradient(135deg,rgba(255,255,255,0.95) 0%,rgba(240,253,244,0.9) 50%,rgba(220,252,231,0.85) 100%)',
    emoji: '🥗', messages: ['活力午餐', '午餐打卡成功', '营养均衡', '中午加油'],
  },
  dinner: {
    colors: ['#A55EEA', '#FF6B35', '#F7941D', '#E8B4B8', '#FFB627', '#C44569'],
    accent: '#A55EEA', accentLight: 'rgba(165,94,234,0.12)',
    cardBg: 'linear-gradient(135deg,rgba(255,255,255,0.95) 0%,rgba(245,238,250,0.9) 50%,rgba(232,180,184,0.85) 100%)',
    emoji: '🌆', messages: ['优雅晚餐', '晚餐打卡成功', '一天完美收尾', '晚间好时光'],
  },
  snack: {
    colors: ['#FF976A', '#FFB6C1', '#FFD700', '#FFA07A', '#FF7F50', '#F4A460'],
    accent: '#FF976A', accentLight: 'rgba(255,151,106,0.12)',
    cardBg: 'linear-gradient(135deg,rgba(255,255,255,0.95) 0%,rgba(255,245,240,0.9) 50%,rgba(255,228,225,0.85) 100%)',
    emoji: '🍪', messages: ['加餐打卡', '补充能量', '小食光', '美味加餐'],
  },
  exercise: {
    colors: ['#FF4757', '#FF6B35', '#F7941D', '#FFA500', '#EE5A24', '#FFD700'],
    accent: '#FF4757', accentLight: 'rgba(255,71,87,0.12)',
    cardBg: 'linear-gradient(135deg,rgba(255,255,255,0.95) 0%,rgba(255,240,240,0.9) 50%,rgba(255,228,225,0.85) 100%)',
    emoji: '💪', messages: ['运动打卡', '燃烧卡路里', '挑战自我', '汗水不会骗人'],
  },
  weight: {
    colors: ['#1677FF', '#4DABF7', '#74C0FC', '#E5E4E2', '#C0C0C0', '#A5D8FF'],
    accent: '#1677FF', accentLight: 'rgba(22,119,255,0.12)',
    cardBg: 'linear-gradient(135deg,rgba(255,255,255,0.95) 0%,rgba(240,248,255,0.9) 50%,rgba(220,240,255,0.85) 100%)',
    emoji: '⚖️', messages: ['体重记录', '见证变化', '每一步都算数', '数据不说谎'],
  },
};

const REWARD_THEME: Theme = {
  colors: ['#FFD700', '#FFC53D', '#D4AF37', '#FFA500', '#F5E6CA', '#FFF8E7', '#E8B4B8', '#E5E4E2', '#C0C0C0'],
  accent: '#D4AF37', accentLight: 'rgba(255,215,0,0.15)',
  cardBg: 'linear-gradient(135deg,rgba(255,255,255,0.95) 0%,rgba(255,248,231,0.9) 50%,rgba(245,230,202,0.85) 100%)',
  emoji: '🎁', messages: ['恭喜解锁', '坚持的回报', '荣誉属于你', '里程碑达成'],
};

const SUBTITLES = ['继续保持，惊喜在后头', '自律的你最闪耀', '今天也是认真生活的一天', '你的坚持正在改变一切'];

// ─── 粒子 ─────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  color: string; size: number; rotation: number; vr: number;
  shape: 'rect' | 'circle' | 'star' | 'sparkle';
  opacity: number; gravity: number;
  delay: number; // 延迟激活帧数
}

// ─── Canvas ───────────────────────────────────────
function createCanvas() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  return { canvas, ctx: canvas.getContext('2d')!, w: window.innerWidth, h: window.innerHeight };
}

// ─── 样式 ─────────────────────────────────────────
function injectStyles() {
  if (document.getElementById('cp-style-v3')) return;
  const s = document.createElement('style');
  s.id = 'cp-style-v3';
  s.textContent = `
    @keyframes cp-in{0%{opacity:0;backdrop-filter:blur(0)}100%{opacity:1;backdrop-filter:blur(6px)}}
    @keyframes cp-out{0%{opacity:1}100%{opacity:0}}
    @keyframes cp-card-in{0%{transform:scale(.5) translateY(30px);opacity:0;filter:blur(8px)}55%{transform:scale(1.06);opacity:1;filter:blur(0)}75%{transform:scale(.97)}100%{transform:scale(1);opacity:1}}
    @keyframes cp-card-out{0%{transform:scale(1);opacity:1}100%{transform:scale(.9) translateY(-15px);opacity:0}}
    @keyframes cp-rays{0%{transform:rotate(0);opacity:.2}50%{opacity:.4}100%{transform:rotate(360deg);opacity:.2}}
    @keyframes cp-glow{0%,100%{box-shadow:0 0 25px rgba(255,215,0,.3),0 0 50px rgba(255,215,0,.1)}50%{box-shadow:0 0 40px rgba(255,215,0,.45),0 0 80px rgba(255,215,0,.18)}}
    @keyframes cp-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
    @keyframes cp-emoji{0%{transform:scale(0) rotate(-15deg)}60%{transform:scale(1.25) rotate(8deg)}80%{transform:scale(.9)}100%{transform:scale(1) rotate(0)}}
  `;
  document.head.appendChild(s);
}

// ─── 玻璃卡片 ─────────────────────────────────────
function createOverlay(theme: Theme, message: string, subtitle: string, isReward: boolean) {
  injectStyles();
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;pointer-events:none;animation:cp-in .35s ease-out forwards;';

  const shimmer = isReward
    ? `background:linear-gradient(90deg,${theme.accent},${theme.colors[0]},${theme.accent});background-size:200% auto;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:cp-shimmer 2s linear infinite;`
    : `color:${theme.accent};`;

  const rays = isReward ? `<div style="position:absolute;width:500px;height:500px;border-radius:50%;background:conic-gradient(from 0deg,transparent 0deg,rgba(255,215,0,.06) 10deg,transparent 20deg,transparent 45deg,rgba(255,215,0,.04) 55deg,transparent 65deg,transparent 90deg,rgba(255,215,0,.06) 100deg,transparent 110deg,transparent 145deg,rgba(255,215,0,.04) 155deg,transparent 165deg,transparent 190deg,rgba(255,215,0,.06) 200deg,transparent 210deg,transparent 245deg,rgba(255,215,0,.04) 255deg,transparent 265deg,transparent 290deg,rgba(255,215,0,.06) 300deg,transparent 310deg,transparent 345deg,rgba(255,215,0,.04) 355deg,transparent 360deg);animation:cp-rays 6s linear infinite;pointer-events:none;"></div>` : '';

  overlay.innerHTML = `
    ${rays}
    <div style="position:relative;background:${theme.cardBg};backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border-radius:28px;padding:36px 44px;text-align:center;border:1.5px solid ${isReward ? 'rgba(212,175,55,.3)' : theme.accentLight};box-shadow:0 16px 48px rgba(0,0,0,.1),0 0 0 1px ${theme.accentLight} inset;${isReward ? 'animation:cp-card-in .55s cubic-bezier(.34,1.56,.64,1) forwards,cp-glow 2s ease-in-out infinite .55s;' : 'animation:cp-card-in .5s cubic-bezier(.34,1.56,.64,1) forwards;'}max-width:78%;overflow:hidden;">
      <div style="font-size:50px;margin-bottom:10px;animation:cp-emoji .6s cubic-bezier(.34,1.56,.64,1) .15s backwards;">${theme.emoji}</div>
      <div style="font-size:20px;font-weight:800;margin-bottom:6px;letter-spacing:1px;${shimmer}">${message}</div>
      <div style="font-size:13px;color:#888;letter-spacing:.3px;">${subtitle}</div>
    </div>`;

  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.style.animation = 'cp-out .35s ease-out forwards';
    const card = overlay.querySelector('div[style*="border-radius"]') as HTMLElement;
    if (card) card.style.animation = 'cp-card-out .3s ease-in forwards';
    setTimeout(() => overlay.remove(), 350);
  }, isReward ? 2600 : 2000);
}

// ─── 粒子工厂 ─────────────────────────────────────
function makeParticle(
  x: number, y: number, angle: number, speed: number,
  colors: string[], delay: number, allowSparkle: boolean
): Particle {
  const r = Math.random();
  const shape: Particle['shape'] = allowSparkle && r > 0.85 ? (r > 0.93 ? 'sparkle' : 'star') : r > 0.5 ? 'rect' : 'circle';
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 2,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 5 + Math.random() * 8,
    rotation: Math.random() * 360,
    vr: (Math.random() - 0.5) * 14,
    shape,
    opacity: 1,
    gravity: 0.12 + Math.random() * 0.12,
    delay,
  };
}

// ─── 全屏爆发序列 ─────────────────────────────────
function buildParticles(w: number, h: number, colors: string[], isReward: boolean): Particle[] {
  const particles: Particle[] = [];
  const cx = w / 2, cy = h / 2;

  // 1. 中心爆炸 (360°)
  const centerCount = isReward ? 55 : 40;
  for (let i = 0; i < centerCount; i++) {
    const angle = (Math.PI * 2 * i) / centerCount + Math.random() * 0.3;
    const speed = 4 + Math.random() * 8;
    particles.push(makeParticle(cx, cy, angle, speed, colors, 0, isReward));
  }

  // 2. 四角爆发 (延迟 3 帧)
  const corners = [
    [w * 0.15, h * 0.25], [w * 0.85, h * 0.25],
    [w * 0.15, h * 0.7],  [w * 0.85, h * 0.7],
  ];
  const cornerCount = isReward ? 30 : 22;
  for (const [px, py] of corners) {
    for (let i = 0; i < cornerCount; i++) {
      const angle = (Math.PI * 2 * i) / cornerCount + Math.random() * 0.4;
      const speed = 3 + Math.random() * 6;
      particles.push(makeParticle(px, py, angle, speed, colors, 3, isReward));
    }
  }

  // 3. 顶部金箔雨 (延迟 6 帧)
  const dropCount = isReward ? 60 : 40;
  for (let i = 0; i < dropCount; i++) {
    const p = makeParticle(
      Math.random() * w, -15,
      Math.PI / 2 + (Math.random() - 0.5) * 0.4,
      1 + Math.random() * 3, colors, 6, isReward
    );
    p.gravity = 0.04 + Math.random() * 0.06;
    p.vr = (Math.random() - 0.5) * 6;
    particles.push(p);
  }

  // 4. 左右礼花炮 (延迟 9 帧)
  const sideCount = isReward ? 25 : 18;
  for (let i = 0; i < sideCount; i++) {
    const angle = Math.random() * 0.6 - 0.3; // 向右偏上
    const speed = 5 + Math.random() * 7;
    particles.push(makeParticle(0, h * 0.55, angle, speed, colors, 9, isReward));
    const angle2 = Math.PI - Math.random() * 0.6 + 0.3; // 向左偏上
    particles.push(makeParticle(w, h * 0.55, angle2, speed, colors, 9, isReward));
  }

  // 5. 奖励专属：二次中心爆发 (延迟 15 帧)
  if (isReward) {
    const burst2 = 45;
    for (let i = 0; i < burst2; i++) {
      const angle = (Math.PI * 2 * i) / burst2 + Math.random() * 0.3;
      const speed = 6 + Math.random() * 10;
      particles.push(makeParticle(cx, h * 0.35, angle, speed, colors, 15, true));
    }
    // 6. 奖励最终散落 (延迟 22 帧)
    for (let i = 0; i < 30; i++) {
      const p = makeParticle(Math.random() * w, -15, Math.PI / 2 + (Math.random() - 0.5) * 0.3, 1 + Math.random() * 2, colors, 22, true);
      p.gravity = 0.05 + Math.random() * 0.05;
      particles.push(p);
    }
  }

  return particles;
}

// ─── 复杂形状绘制 ─────────────────────────────────
function drawStar(ctx: CanvasRenderingContext2D, s: number) {
  const outer = s / 2, inner = s / 4;
  let rot = -Math.PI / 2;
  const step = Math.PI / 5;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    ctx.lineTo(Math.cos(rot) * outer, Math.sin(rot) * outer);
    rot += step;
    ctx.lineTo(Math.cos(rot) * inner, Math.sin(rot) * inner);
    rot += step;
  }
  ctx.closePath();
  ctx.fill();
}

function drawSparkle(ctx: CanvasRenderingContext2D, s: number) {
  const r = s / 2;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.quadraticCurveTo(0, 0, 0, r);
  ctx.quadraticCurveTo(0, 0, -r, 0);
  ctx.quadraticCurveTo(0, 0, 0, -r);
  ctx.closePath();
  ctx.fill();
}

// ─── 主循环 (分批渲染) ────────────────────────────
function runConfetti(theme: Theme, isReward: boolean) {
  const { canvas, ctx, w, h } = createCanvas();
  const colors = theme.colors;
  const particles = buildParticles(w, h, colors, isReward);
  const maxFrames = isReward ? 160 : 120;
  const flashColor = colors[0];
  let frame = 0;

  function animate() {
    ctx.clearRect(0, 0, w, h);
    frame++;

    // 开头全屏闪光 (前 4 帧)
    if (frame <= 4) {
      ctx.globalAlpha = 0.12 * (1 - frame / 4);
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, w, h);
    }

    const decay = 1 - frame / maxFrames;

    // ── Phase 1: 更新物理 ──
    for (const p of particles) {
      if (frame < p.delay) continue;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.vx *= 0.99;
      p.rotation += p.vr;
      p.opacity = Math.max(0, decay);
    }

    // ── Phase 2: 批量绘制 rect (无 transform，最快) ──
    for (const p of particles) {
      if (p.shape !== 'rect' || frame < p.delay) continue;
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 4, p.size, p.size / 2);
    }

    // ── Phase 3: 批量绘制 circle (无 transform) ──
    for (const p of particles) {
      if (p.shape !== 'circle' || frame < p.delay) continue;
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Phase 4: 绘制 star/sparkle (需要 transform，占比小) ──
    for (const p of particles) {
      if (p.shape === 'rect' || p.shape === 'circle' || frame < p.delay) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;
      if (p.shape === 'star') drawStar(ctx, p.size);
      else drawSparkle(ctx, p.size);
      ctx.restore();
    }

    if (frame < maxFrames) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }

  animate();
}

// ─── 对外接口 ─────────────────────────────────────

/**
 * 安卓震动反馈（iOS 不支持 navigator.vibrate，静默跳过）
 * 重震一下 + 轻震一下
 */
function vibratePattern() {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate([120, 80, 40]);
}

export function celebrateCheckin(type: CheckinType) {
  const theme = THEMES[type];
  const msg = theme.messages[Math.floor(Math.random() * theme.messages.length)];
  const sub = SUBTITLES[Math.floor(Math.random() * SUBTITLES.length)];
  createOverlay(theme, msg, sub, false);
  runConfetti(theme, false);
  vibratePattern();
}

export function celebrateReward(giftName?: string) {
  const theme = REWARD_THEME;
  const msg = theme.messages[Math.floor(Math.random() * theme.messages.length)];
  const sub = giftName ? `「${giftName}」已解锁，前往奖励页面领取` : '前往奖励页面领取你的礼品';
  createOverlay(theme, msg, sub, true);
  runConfetti(theme, true);
  vibratePattern();
}
