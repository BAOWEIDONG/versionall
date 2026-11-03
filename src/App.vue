<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick, defineAsyncComponent, type Component } from 'vue';
import { useAppStore } from './store/app';
import VideoPreview from './components/VideoPreview.vue';
import ViewSkeleton from './components/ui/ViewSkeleton.vue';
// 登录落地 / 入职必走页：常驻(不懒加载)，进入零等待、不闪骨架屏。
// 登录页(App 启动首个画面) + 三端首页 + 学员问卷(登录后必经)
import Login from './components/LoginView.vue';
import StudentDashboard from './components/StudentDashboardView.vue';
import DietitianDashboard from './components/DietitianDashboardView.vue';
import CoachDashboard from './components/CoachDashboardView.vue';
import Questionnaire from './components/QuestionnaireView.vue';

// 异步视图统一包装：加载 chunk 期间立即显示共享骨架屏，避免白屏"等好久"
function lazyView(loader: () => Promise<{ default: Component }>): Component {
  return defineAsyncComponent({ loader, loadingComponent: ViewSkeleton, delay: 0 });
}

// 视图文件路径（供按角色预取 tab 页 chunk）——预取实际走 VIEW_IMPORTERS，此表已废弃
const VIEW_IMPORTERS: Record<string, () => Promise<{ default: Component }>> = {
  login: () => import('./components/LoginView.vue'),
  register: () => import('./components/RegisterView.vue'),
  questionnaire: () => import('./components/QuestionnaireView.vue'),
  upload: () => import('./components/UploadView.vue'),
  dashboard: () => import('./components/StudentDashboardView.vue'),
  'health-profile': () => import('./components/HealthProfileView.vue'),
  exercise: () => import('./components/ExerciseView.vue'),
  diet: () => import('./components/DietView.vue'),
  'weight-checkin': () => import('./components/WeightCheckinView.vue'),
  calendar: () => import('./components/CalendarView.vue'),
  'coach-dashboard': () => import('./components/CoachDashboardView.vue'),
  'coach-student-detail': () => import('./components/CoachStudentDetailView.vue'),
  'coach-unannotated-list': () => import('./components/CoachUnannotatedListView.vue'),
  'activity-upload': () => import('./components/ActivityUploadView.vue'),
  'activities-list': () => import('./components/ActivitiesListView.vue'),
  'dietitian-dashboard': () => import('./components/DietitianDashboardView.vue'),
  'dietitian-student-detail': () => import('./components/DietitianStudentDetailView.vue'),
  'dietitian-unannotated-list': () => import('./components/DietitianUnannotatedListView.vue'),
  ranking: () => import('./components/RankingView.vue'),
  pointsDetail: () => import('./components/PointsDetailView.vue'),
  reward: () => import('./components/RewardView.vue'),
  'reward-config': () => import('./components/RewardConfigView.vue'),
  'meal-time-config': () => import('./components/MealTimeConfigView.vue'),
  'metric-config': () => import('./components/MetricConfigView.vue'),
  'camp-summary': () => import('./components/DietitianCampSummaryView.vue'),
  'enterprise-report': () => import('./components/EnterpriseReportView.vue'),
  'camp-report': () => import('./components/CampReportView.vue'),
  'camp-activities': () => import('./components/CampActivitiesView.vue'),
  'activity-admin': () => import('./components/ActivityAdminView.vue'),
  'personal-journey': () => import('./components/PersonalJourneyView.vue'),
  messages: () => import('./components/MessagesView.vue'),
  'account-manage': () => import('./components/AccountManageView.vue'),
  'dietitian-config': () => import('./components/DietitianConfigView.vue'),
  'activity-hub': () => import('./components/ActivityHubView.vue'),
  'points-mall': () => import('./components/PointsMallView.vue'),
  'fulfillment-center': () => import('./components/FulfillmentCenterView.vue'),
  'my-rewards': () => import('./components/MyRewardsView.vue'),
  'camp-stats': () => import('./components/CampStatsView.vue'),
  'attendance-board': () => import('./components/AttendanceBoardView.vue'),
  'badge-center': () => import('./components/BadgeCenterView.vue'),
  'badge-config': () => import('./components/BadgeConfigView.vue'),
  'supervisor-dashboard': () => import('./components/SupervisorDashboardView.vue'),
};

// 各角色底部 tab 与常用子页（角色预取，配合下方全量预取双保险）
const ROLE_TABS: Record<string, string[]> = {
  student: ['dashboard', 'activity-hub', 'messages', 'health-profile', 'exercise', 'diet', 'weight-checkin', 'points-mall', 'calendar', 'reward'],
  dietitian: ['dietitian-dashboard', 'dietitian-unannotated-list', 'dietitian-config', 'fulfillment-center', 'reward-config', 'dietitian-student-detail', 'account-manage'],
  coach: ['coach-dashboard', 'coach-student-detail', 'coach-unannotated-list', 'activity-upload', 'activities-list'],
};
let prefetchedRole = false;
let prefetchedAll = false;
function prefetchTabs(role: string) {
  if (prefetchedRole) return;
  prefetchedRole = true;
  const keys = ROLE_TABS[role] || [];
  const go = () => { keys.forEach((k) => { const imp = VIEW_IMPORTERS[k]; if (imp) imp().catch(() => { /* 预取失败忽略 */ }); }); };
  scheduleIdle(go);
}
// 首帧渲染稳定后，空闲预取「全部」视图 chunk：让后续任何页面点击都不再等网络，彻底消除“点页面转圈”
function prefetchAll() {
  if (prefetchedAll) return;
  prefetchedAll = true;
  const go = () => {
    Object.values(VIEW_IMPORTERS).forEach((imp) => { try { imp().catch(() => { /* 忽略 */ }); } catch { /* 忽略 */ } });
  };
  scheduleIdle(go);
}
function scheduleIdle(fn: () => void) {
  const ric = (window as any).requestIdleCallback;
  if (ric) { ric(fn, { timeout: 3000 }); } else { setTimeout(fn, 500); }
}

// 视图映射：三端首页常驻(零等待)，其余全部按需 + 骨架屏
const viewMap: Record<string, Component> = Object.fromEntries(
  Object.keys(VIEW_IMPORTERS).map((k) => [k, lazyView(VIEW_IMPORTERS[k])]),
);
// 覆盖：登录落地/入职必走页改为常驻组件（登录页 + 三端首页 + 学员问卷）
viewMap.login = Login;
viewMap.dashboard = StudentDashboard;
viewMap['dietitian-dashboard'] = DietitianDashboard;
viewMap['coach-dashboard'] = CoachDashboard;
viewMap.questionnaire = Questionnaire;

const store = useAppStore();

const currentComponent = computed<Component>(() => viewMap[store.currentView] || viewMap.login);

// KeepAlive 缓存键：同一账户会话内按"视图"缓存（返回/切 tab 不重建，性能收益保留）；
// 但账户切换(登录不同人)会改变 user.id → 所有视图键都变，旧账户缓存整体作废并全新挂载，
// 杜绝"换账户后仍显示前一个人的姓名 / 问卷预填别人数据"的串账户问题。
const viewCacheKey = computed(() => `${store.user?.id || 'anon'}:${store.currentView}`);

// 同步营养师/教练角色到 <body>，用于全局复用首页浅渐变背景（学员端不挂该类）
function syncRoleClass(role?: string | null) {
  document.body.classList.remove('role-diet', 'role-coach');
  if (role === 'dietitian') document.body.classList.add('role-diet');
  else if (role === 'coach') document.body.classList.add('role-coach');
}
watch(() => store.user?.role, (r) => syncRoleClass(r));

// 视图切换时滚动到顶部
const scrollContainer = ref<HTMLElement | null>(null);
watch(() => store.currentView, () => {
  nextTick(() => {
    scrollContainer.value?.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  });
});

// ─── 手机返回手势适配 ─────────────────────────────────────────────
// 1) 页面栈同步到浏览器 history：安卓系统返回、iPhone Safari 左缘返回会触发 popstate，
//    统一走 store.popViewHistory()，不再直接离开页面。
// 2) 独立 PWA 下系统手势不可用，补一个左缘右滑返回（只在 standalone 模式启用，避免与系统手势双触发）。
let suppressHistoryPush = false;
function onPopState() {
  if (store.viewHistory.length > 1) {
    suppressHistoryPush = true;
    store.popViewHistory();
  }
  // 始终保留一条哨兵记录，保证下一次返回仍由页面接管，而不是跳出站点
  window.history.pushState({ __camp: true }, '');
}
watch(() => store.currentView, () => {
  if (suppressHistoryPush) { suppressHistoryPush = false; return; }
  window.history.pushState({ __camp: true }, '');
});

const isStandalone = typeof window !== 'undefined'
  && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
const edgeActive = ref(false);
const edgeDx = ref(0);
let edgeStartX = 0;
let edgeStartY = 0;
let edgeTracking = false;
function onEdgeStart(e: TouchEvent) {
  if (!isStandalone || e.touches.length !== 1 || store.viewHistory.length <= 1) return;
  const t = e.touches[0];
  if (t.clientX > 24) return; // 只认左边缘 24px 起手
  edgeTracking = true;
  edgeActive.value = true;
  edgeDx.value = 0;
  edgeStartX = t.clientX;
  edgeStartY = t.clientY;
  // 阻止页面内的 Tab 横滑同时响应
  e.stopPropagation();
}
function onEdgeMove(e: TouchEvent) {
  if (!edgeTracking) return;
  const t = e.touches[0];
  const dx = t.clientX - edgeStartX;
  const dy = t.clientY - edgeStartY;
  if (dx > 0 && Math.abs(dx) > Math.abs(dy)) {
    edgeDx.value = Math.min(110, dx);
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
  } else if (Math.abs(dy) > 24) {
    edgeTracking = false;
    edgeActive.value = false;
    edgeDx.value = 0;
  }
}
function onEdgeEnd() {
  if (!edgeTracking) return;
  const fire = edgeDx.value >= 70;
  edgeTracking = false;
  edgeActive.value = false;
  edgeDx.value = 0;
  if (fire) store.goBack();
}
function onEdgeCancel() {
  edgeTracking = false;
  edgeActive.value = false;
  edgeDx.value = 0;
}

// 启用 iOS 液态玻璃悬浮 Tabbar（打印时移除，回到普通 Tabbar 并遵循 print:hidden）
const handleBeforePrint = () => document.body.classList.remove('liquid-glass');
const handleAfterPrint = () => document.body.classList.add('liquid-glass');

onBeforeUnmount(() => {
  window.removeEventListener('beforeprint', handleBeforePrint);
  window.removeEventListener('afterprint', handleAfterPrint);
  window.removeEventListener('popstate', onPopState);
  window.removeEventListener('touchstart', onEdgeStart, true);
  window.removeEventListener('touchmove', onEdgeMove, true);
  window.removeEventListener('touchend', onEdgeEnd, true);
  window.removeEventListener('touchcancel', onEdgeCancel, true);
});

onMounted(() => {
  // 初始化浏览器历史哨兵 + 返回手势监听
  if (typeof window !== 'undefined') {
    window.history.replaceState({ ...(window.history.state || {}), __camp: true }, '');
    window.history.pushState({ __camp: true }, '');
    window.addEventListener('popstate', onPopState);
    window.addEventListener('touchstart', onEdgeStart, { capture: true, passive: true });
    window.addEventListener('touchmove', onEdgeMove, { capture: true, passive: false });
    window.addEventListener('touchend', onEdgeEnd, { capture: true, passive: true });
    window.addEventListener('touchcancel', onEdgeCancel, { capture: true, passive: true });
  }
  document.body.classList.add('liquid-glass');
  window.addEventListener('beforeprint', handleBeforePrint);
  window.addEventListener('afterprint', handleAfterPrint);

  // 先尝试恢复登录态（保活），再加载数据
  store.restoreAuth();
  store.init();
  syncRoleClass(store.user?.role);

  // 等登录角色确定后再按角色空闲预取底部 tab 页 chunk（登录页不预取，避免误拉）
  watch(() => store.user?.role, (r) => { if (r) prefetchTabs(r); }, { immediate: true });
  // 首帧渲染 + 初始化完成后，空闲预取全部视图 chunk：后续任何页面点击都不再转圈
  prefetchAll();
});
</script>

<template>
  <div class="fixed inset-0 max-w-md mx-auto overflow-hidden font-sans text-gray-700 sm:shadow-2xl sm:border-x sm:border-gray-100">
    <div ref="scrollContainer" class="absolute inset-0 overflow-y-auto overflow-x-hidden overscroll-contain" style="-webkit-overflow-scrolling: touch; touch-action: pan-y;">
      <div class="relative">
        <!-- 视图缓存：去掉 :key 强制重建，改用 KeepAlive 缓存已访问视图。
             返回/切底部 tab 不再整个销毁重建，大幅降低导航卡顿（性能优化） -->
        <KeepAlive>
          <component :is="currentComponent" :key="viewCacheKey" />
        </KeepAlive>
      </div>
    </div>
    <VideoPreview />

    <!-- PWA 左缘滑动返回指示 -->
    <div
      v-if="edgeActive"
      class="fixed left-0 top-1/2 -translate-y-1/2 z-[2000] pointer-events-none transition-opacity"
      :style="{ opacity: Math.min(1, edgeDx / 70) }"
    >
      <div class="w-9 h-16 rounded-r-2xl bg-black/25 backdrop-blur flex items-center justify-center text-white text-2xl">‹</div>
    </div>
  </div>
</template>

<style>
</style>
