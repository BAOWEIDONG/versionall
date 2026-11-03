import { onMounted, onBeforeUnmount, type Ref } from 'vue';

/**
 * 数据页顶部 sheet tab 支持左右滑动切换（打卡 ⇄ 趋势 ⇄ 记录 / 消息分类）。
 *
 * 用 onMounted + addEventListener 把 touch 事件直接绑到容器元素上（而非模板
 * `@touchstart.passive` 属性），以免疫生产构建里模板事件属性被压缩改名而错绑
 * 到其它处理器、导致滑动失效的问题（曾因该坑全站三个数据页滑动都失灵）。
 *
 * 方向判定（v18 定稿，不明锁方向）：不再用「方向轴锁」——那会在起手第一个采样点就
 * 定死横/纵，Arco右滑回程(从末tab回滑)手指先向下再横向、中间某采样 dy>dx 一超过阈值即被
 * 锁成纵向且永不恢复，导致从「系统通知」向左回滑到「全部」被无视、tab「卡住不动」。
 *
 * 现改为两段判定，全程可由最终位移兜底、不被中间抖动锁死：
 *  1) 滑动中（每次 move 重新实时算，不锁定）：仅当「运行位移 |dx| ≥ PD_MIN(24) 且
 *     |dx| > |dy|（横向占优）」才 committedH=true 并 preventDefault——阻止页面纵向
 *     滚动 + 吃掉松手落点按钮的合成 click(避免滑切 tab 又误开消息)。纵向手势、点按、
 *     横向漂移都不满足，故不干预，点按照常触发 click。用「>|dy|」而非比例，让 40~55°
 *     的右向回滑也能被判横、被吞点，同时真纵向滚动(|dy|>|dx|)永不被 preventDefault。
 *  2) 松手时：用「起止总位移」判是否切 tab（此时位移稳定，天然容忍起手先斜后的弧）：
 *     仅当 |dx| ≥ threshold(50) 且 |dx| > |dy|（总位移横向占优）才切换。纵向滚动即使带
 *     横向漂移，只要总位移仍以纵向为主(|dy|>|dx|)就不切换——保住上滑列表不误切 tab；
 *     真正横向占优(>45°)且 ≥50px 的姿势即为横滑，切换。blocked 容器内由原生横向接管。
 */
export function useTabSwipe<T extends string>(
  container: Ref<HTMLElement | null>,
  activeTab: Ref<T>,
  tabs: readonly T[],
  threshold = 50,
) {
  let startX = 0;
  let startY = 0;
  let tracking = false;
  let blocked = false; // 手势起点在横向滚动容器内（如记录页照片墙），让原生横向滚动接管，不切 tab
  let committedH = false; // 已mid-gesture判为横滑并 preventDefault(吞点/吞滚动)，每次 move 重算不锁定

  // 横滑才调 preventDefault 的最小运行位移：防止带轻微横向漂移的点按被吞掉 click→要点多次。
  // 需切 tab 的横滑至少 50px，其过程位移必超此阈值，故仍能阻止误开消息。
  const PD_MIN = 24;

  // 手势起点是否落在「内容确实可横向滚动」的容器内（overflow-x 且 scrollWidth>clientWidth）
  function isHorizontalScrollTarget(root: HTMLElement, target: HTMLElement): boolean {
    let el: HTMLElement | null = target;
    while (el && el !== root) {
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      if ((ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
      el = el.parentElement;
    }
    return false;
  }

  // 只响应「本视图」内的手势。视图根节点 container 是当前页内容；当手指落在列表空白处时，
  // touch 的 e.target 不是视图内元素，而是包裹视图的页面滚动外壳(视图的祖先)。若不认这个
  // 外壳，空白区起手的手势就收不到 → 末tab(消息中心「系统通知」/数据页)在内容较短时空
  // 白区回滑、tab「卡住不动」的真正根因。因此「target 在视图内」或「target 是视图的祖先」
  // (即外壳上空白处)都算本视图手势。底部 tabbar/顶部 navbar 不含视图、也不被视图含，故排除。
  function inView(target: EventTarget | null, view: HTMLElement | null): boolean {
    if (!view || !(target instanceof Element)) return false;
    return view.contains(target) || target.contains(view);
  }

  function onTouchStart(e: TouchEvent) {
    const target = e.target as HTMLElement | null;
    if (target && target.closest('.van-nav-bar, .van-tabbar')) return; // 顶部导航/底部 tabs 上的手势不参与
    if (!inView(e.target, container.value)) return; // 只响应本视图内/其滚动外壳上的起手
    const t = e.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
    committedH = false;
    blocked = target && container.value ? isHorizontalScrollTarget(container.value, target) : false;
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking || blocked) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    // 每次 move 实时重算（不锁定轴，容忍起手先斜后的弧形回滑）：仅当运行位移够大且
    // 横向占优才判为横滑并 preventDefault(阻纵向滚动 + 吞落点 click)。
    committedH = Math.abs(dx) >= PD_MIN && Math.abs(dx) > Math.abs(dy);
    if (committedH && e.cancelable) e.preventDefault();
  }

  function onTouchEnd(e: TouchEvent) {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const wasBlocked = blocked;
    committedH = false;
    blocked = false;
    // 起点在横向滚动容器内 → 让原生横向滚动接管，不切 tab
    if (wasBlocked) return;
    // 用起止总位移判方向（松手时位移稳定，天然容忍起手先斜的弧）：横向占优且足够远才切。
    if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy)) return;
    const cur = tabs.indexOf(activeTab.value);
    const next = dx < 0 ? Math.min(cur + 1, tabs.length - 1) : Math.max(cur - 1, 0);
    if (next !== cur) activeTab.value = tabs[next];
  }

  function onTouchCancel() {
    tracking = false;
    blocked = false;
    committedH = false;
  }

  onMounted(() => {
    // 把 touch 监听绑到 document 冒泡(而非只绑视图根节点)：手势落在列表空白处的 target 是
    // 页面滚动外壳(视图祖先)，若只绑视图根节点会根本收不到触碰 → tab「卡住」。用冒泡而非
    // 捕获：滑动趋势图等子组件在自身用 stopPropagation 与 tab 切换解耦，捕获会先于其执行、
    // 破坏该解耦；冒泡则在其 stop 之后，天然不打扰子组件的水平手势。
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false }); // 需要 preventDefault
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchCancel);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    document.removeEventListener('touchcancel', onTouchCancel);
  });
}