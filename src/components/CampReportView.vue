<script setup lang="ts">
import { computed, ref, watch, onActivated } from 'vue';
import { format } from 'date-fns';
import { useAppStore } from '../store/app';
import { campDateRange, campDaysOf, elapsedCampDays } from '../lib/camps';
import { NavBar, Card, StudentTabbar } from './ui';
import { Trophy, TrendingDown, TrendingUp, Activity, Target, Download, Lock, MessageCircle, Award } from 'lucide-vue-next';
import BadgeInfoPopup from './BadgeInfoPopup.vue';
import { Popup as VanPopup } from 'vant';
import { metricValuesFor } from '../mock/data';
import { generateStudentReport, weightTrendToSvgPoints } from '../lib/campReport';
import { exportReport } from '../lib/exportPDF';
import type { StudentCampReport, MetricChange, BadgeConfig, BadgeRecord } from '../types';

const store = useAppStore();

// 获取当前学员数据
const studentId = computed(() => store.user?.id || 's1');
const studentName = computed(() => store.user?.name || '学员');
const studentGender = computed(() => store.user?.gender);

// ─── 营期切换（学员可能在多个营期中） ───
const studentCamps = computed(() => store.getStudentCamps(studentId.value));
const selectedCampId = ref<string>('');
const showCampPicker = ref(false);
const selectedCamp = computed(() => studentCamps.value.find((c) => c.id === selectedCampId.value) || null);

// 初始化选中营期（优先 active，其次 ended）
watch(() => studentId.value, (id) => {
  if (id) {
    const camp = store.getStudentCamp(id);
    if (camp) selectedCampId.value = camp.id;
  }
}, { immediate: true });

// KeepAlive 再次进入时跟随首页当前营期，避免首页已切到第二期、报告仍停在第一期
onActivated(() => {
  const gid = store.selectedCampId;
  if (gid && studentCamps.value.some((c) => c.id === gid) && gid !== selectedCampId.value) {
    selectedCampId.value = gid;
  }
});

// 营期信息
const campInfo = computed(() => selectedCamp.value || store.getStudentCamp(studentId.value));
const campDays = computed(() => {
  if (campInfo.value?.startDate && campInfo.value?.endDate) {
    return campDaysOf(campInfo.value);
  }
  return store.getCampDays(studentId.value);
});
// 报告统计天数：进行中的营期按「开营到今天」计算，避免刚开营就用 28 天做分母（完成率 4%）
const reportDays = computed(() => elapsedCampDays(campInfo.value));
// 学员端结营报告不再上锁：营期未结束也可随时打开查看（数据为截至当前的累计）
const canView = computed(() => true);

// 按营期过滤打卡记录
const campDietRecords = computed(() => selectedCampId.value ? store.getCampDietRecords(selectedCampId.value) : store.dietRecords);
const campExerciseRecords = computed(() => selectedCampId.value ? store.getCampExerciseRecords(selectedCampId.value) : store.exerciseRecords);
const campWeightRecords = computed(() => selectedCampId.value ? store.getCampWeightRecords(selectedCampId.value) : store.weightRecords);

// 徽章墙：与「我的徽章」完全同源 —— 里程碑 + 成就 + 活动，全部读营养师配置与同一份获得记录
const badgeView = computed(() => {
  const cid = selectedCampId.value || campInfo.value?.id;
  if (!cid || !store.user) return { earned: [] as BadgeRecord[], activeConfigs: [] as BadgeConfig[], historical: [] as BadgeRecord[] };
  return store.getStudentBadgeView(store.user.id, cid);
});

const badgeWall = computed(() => {
  const { earned, activeConfigs, historical } = badgeView.value;
  const order = { milestone: 0, achievement: 1, activity: 2 } as const;
  const active = activeConfigs
    .slice()
    .sort((a, b) => order[a.category] - order[b.category])
    .map((c) => {
      const count = earned.filter((b) => b.badgeId === c.id).length;
      return {
        id: c.id,
        title: count > 1 ? `${c.name} ×${count}` : c.name,
        description: c.description || '',
        icon: c.icon,
        unlocked: count > 0,
      };
    });
  // 停用/删除后保留的历史徽章，同样展示，保证与「我的徽章」总数一致
  const hist = historical.map((r) => ({
    id: `h_${r.id}`,
    title: `${r.badgeName}（历史）`,
    description: '活动已停用，已获得徽章保留',
    icon: r.icon,
    unlocked: true,
  }));
  return [...active, ...hist];
});
const unlockedAchievements = computed(() => badgeWall.value.filter((a) => a.unlocked));
// 已获得徽章总枚数（与「我的徽章」顶部总数同口径：活动徽章按实际枚数累计）
const earnedBadgeCount = computed(() => badgeView.value.earned.length);

const showBadgeInfo = ref(false);
const selectedBadgeCfg = ref<BadgeConfig | null>(null);
const selectedBadgeRecords = computed(() => {
  if (!selectedBadgeCfg.value) return [];
  return badgeView.value.earned.filter((b) => b.badgeId === selectedBadgeCfg.value!.id);
});
const openBadgeInfo = (item: { id: string }) => {
  const view = badgeView.value;
  let cfg: BadgeConfig | undefined = view.activeConfigs.find((c) => c.id === item.id);
  if (!cfg) {
    // 历史徽章：记录里已无对应生效配置，按记录构造只读说明
    const rec = view.historical.find((r) => `h_${r.id}` === item.id) || view.earned.find((r) => r.badgeId === item.id);
    if (!rec) return;
    cfg = {
      id: rec.badgeId, category: rec.category, name: rec.badgeName, cadence: rec.cadence,
      condition: 'checkin_days', threshold: 1, icon: rec.icon, active: false,
      description: '活动已停用，已获得徽章保留',
    };
  }
  selectedBadgeCfg.value = cfg;
  showBadgeInfo.value = true;
};

// 进入报告时按当前配置同步一次徽章
watch(
  () => campInfo.value?.id,
  (cid) => { if (cid) store.syncBadges(cid); },
  { immediate: true },
);

// 未读批注数（tabbar badge）
// 消息未读数（批注 + 系统通知，store 级统一，与各学员页「消息」Tab 角标一致）
const unreadCount = computed(() =>
  store.user?.role === 'student' ? store.getStudentMsgUnreadCount(store.user.id) : 0,
);

// 体重记录（当前学员，按营期过滤）
const studentWeights = computed(() =>
  campWeightRecords.value.filter((r) => r.studentId === studentId.value),
);

// 饮食记录（当前学员，按营期过滤）
const studentDiets = computed(() =>
  campDietRecords.value.filter((r) => r.studentId === studentId.value),
);

// 运动记录（当前学员，按营期过滤）
const studentExercises = computed(() =>
  campExerciseRecords.value.filter((r) => r.studentId === studentId.value),
);

// 生成结营报告
const report = computed<StudentCampReport>(() =>
  generateStudentReport(
    { id: studentId.value, name: studentName.value, gender: studentGender.value },
    store.metricConfigs,
    metricValuesFor(studentId.value, selectedCampId.value || campInfo.value?.id),
    studentDiets.value,
    studentExercises.value,
    studentWeights.value,
    reportDays.value,
  ),
);

// 体重趋势 SVG
const svgPoints = computed(() => weightTrendToSvgPoints(report.value.weightTrend, 280, 100, 20));

// 指标变化合并为单模块：体成分(身体测量数据) + 化验指标统一按分类分组展示。
// ① 无营前营后数据的指标一律不显示；② 分类名/指标名取自本期指标配置(config)，
//    配置里改了分类或名称这里自动同步；③ 组内排序：有前后值的排前面，改善的排前面。
const metricGroups = computed(() => {
  const groups = new Map<string, MetricChange[]>();
  for (const m of report.value.metricChanges) {
    if (m.beforeValue !== null || m.afterValue !== null) {
      if (!groups.has(m.category)) groups.set(m.category, []);
      groups.get(m.category)!.push(m);
    }
  }
  return Array.from(groups.entries()).map(([cat, items]) => [
    cat,
    [...items].sort((a, b) => {
      const aHas = a.beforeValue !== null && a.afterValue !== null;
      const bHas = b.beforeValue !== null && b.afterValue !== null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas && a.isImproved !== b.isImproved) return a.isImproved ? -1 : 1;
      return 0;
    }),
  ] as [string, MetricChange[]]);
});

/** 结营留言项：来源(寄语或某类批注)、作者角色、作者姓名、正文 */
interface ReportMessage {
  id: string;
  kind: '寄语' | '饮食批注' | '运动批注' | '体重批注';
  role: 'dietitian' | 'coach';
  name: string;
  text: string;
  time: string;
}

// 结营寄语留言列表（可能多名营养师各自撰写寄语，逐条展示带角色姓名，不互相覆盖）
const reportMessages = computed<ReportMessage[]>(() => {
  const sid = studentId.value;
  const cid = selectedCampId.value || campInfo.value?.id;
  const list: ReportMessage[] = [];
  // 结营寄语（campMessageList append 语义，可多条）；仅营养师可填写，教练寄语一律不展示
  if (cid) {
    store.getCampMessages(cid, sid).filter((m) => m.role === 'dietitian').forEach((m) => {
      list.push({
        id: m.id, kind: '寄语', role: m.role, name: m.authorName, text: m.text, time: m.createdAt,
      });
    });
  }
  // 按时间倒序（最新在前）
  return list.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
});

const roleTag = (m: ReportMessage) => (m.role === 'coach' ? { badge: '教练', cls: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20' } : { badge: '营养师', cls: 'bg-[#1677FF]/10 text-[#1677FF] border-[#1677FF]/20' });

// 「结营建议」已移除：结营寄语已足够，学员端报告不再展示结营建议。

// 目标达成度（学员在体重打卡页设置的目标体重）
const targetInfo = computed(() => {
  const target = store.user?.targetWeight;
  const start = report.value.weightTrend.startWeight;
  const end = report.value.weightTrend.endWeight;
  if (!target || start === null || end === null) return null;
  const needLose = start - target;      // 需要减的总量
  const actualLose = start - end;       // 实际减的
  if (needLose <= 0) {
    return { target, end, achieved: end <= target, progress: end <= target ? 1 : 0, text: end <= target ? '已达到目标体重' : '目标体重高于开营体重' };
  }
  const progress = Math.min(Math.max(actualLose / needLose, 0), 1.5);
  return { target, end, achieved: end <= target, progress, remaining: Math.max(end - target, 0) };
});

// 格式化
const fmt = (v: number | null, digits = 1): string => v === null ? '--' : v.toFixed(digits);
const fmtPct = (v: number | null): string => v === null ? '--' : `${(v * 100).toFixed(0)}%`;

/** 留言时间：yyyy-MM-dd HH:mm:ss → M月d日 HH:mm */
const formatMsgTime = (t: string): string => {
  if (!t) return '';
  const d = new Date(t.replace(/-/g, '/'));
  if (Number.isNaN(+d)) return t;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtChange = (v: number | null, unit = ''): string => {
  if (v === null) return '--';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}${unit ? ' ' + unit : ''}`;
};

// 指标变化展示文本
const metricChangeText = (m: MetricChange): string => {
  if (m.change === null) return '未检测';
  return fmtChange(m.change, m.unit);
};

// 指标变化颜色
const metricChangeColor = (m: MetricChange): string => {
  if (m.change === null) return 'text-gray-400';
  return m.isImproved ? 'text-[#07C160]' : 'text-orange-500';
};

// 体重变化趋势箭头
const weightTrendIcon = computed(() => {
  if (report.value.weightTrend.trend === 'decreasing') return TrendingDown;
  if (report.value.weightTrend.trend === 'increasing') return TrendingUp;
  return Activity;
});

// 顶部鼓励语：固定优先级拼接——①体重减重→②肌肉增加→③脂肪减少，命中几条拼几条，
// 皆未命中则用累计/最长连续打卡天数兜底。句式固定，以「不积跬步…不积汗水…」收尾。
// 口径：优先级指标必须有营前营后数据且方向正确(体重/脂肪为降、肌肉为增)才取值拼接，无数据或方向不符跳过。
const encouragement = computed(() => {
  const s = report.value.summary;
  const name = studentName.value;
  // 第1优先：体重——有营前营后数据且降低
  const p1 = (s.weightLossKg !== null && s.weightLossKg > 0) ? `减重${s.weightLossKg.toFixed(1)}公斤` : '';
  // 第2优先：肌肉量——有营前营后数据且增加
  const p2 = (s.muscleChangeKg !== null && s.muscleChangeKg > 0) ? `肌肉增加${s.muscleChangeKg.toFixed(1)}公斤` : '';
  // 第3优先：脂肪量——有营前营后数据且降低
  const p3 = (s.bodyFatLossKg !== null && s.bodyFatLossKg > 0) ? `脂肪量减少${s.bodyFatLossKg.toFixed(1)}公斤` : '';

  const middle = p1 || p2 || p3
    ? [p1, p2, p3].filter(Boolean).join('，')
    : `累计坚持打卡${s.totalCheckinDays}天，最长连续打卡${s.longestStreak}天`;

  return `恭喜你，${name}！本次营期${middle}，不积跬步无以至千里，不积汗水无以塑身形。`;
});

// ─── 导出（普通浏览器=PDF，微信=长图长按保存）───
const exportRef = ref<HTMLElement | null>(null);
const exportPDF = () => {
  if (exportRef.value) {
    exportReport(exportRef.value, `个人营期报告_${studentName.value}_${new Date().toISOString().split('T')[0]}`);
  }
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-24 font-sans">
    <NavBar title="个人营期报告" :on-back="store.goBack">
      <template #right>
        <button v-if="canView" class="text-[#07C160] hover:bg-green-50 p-2 rounded-full transition-colors" @click="exportPDF">
          <Download class="h-5 w-5" />
        </button>
      </template>
    </NavBar>

    <!-- 营期切换（学员在多个营期时显示） -->
    <div v-if="studentCamps.length > 1" class="bg-white px-4 py-2.5 flex items-center justify-between border-b border-gray-100">
      <div>
        <span class="text-xs text-gray-500">当前营期：</span>
        <span class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '未选择' }}</span>
      </div>
      <button class="text-xs text-[#07C160] border border-[#07C160] px-2.5 py-1 rounded-full font-bold active:bg-green-50" @click="showCampPicker = true">
        切换
      </button>
    </div>

    <!-- 营期未结束：显示锁定状态 -->
    <div v-if="!canView" class="flex-1 flex flex-col items-center justify-center px-6 text-center">
      <div class="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Lock class="w-10 h-10 text-gray-400" />
      </div>
      <h3 class="text-lg font-bold text-gray-700 mb-2">个人营期报告尚未生成</h3>
      <p class="text-sm text-gray-500 leading-relaxed">
        你的营期（{{ campInfo?.name || '当前期' }}）预计于
        <span class="font-medium text-gray-700">{{ campInfo?.endDate || '--' }}</span>
        结束，届时将自动生成个人营期报告。
      </p>
    </div>

    <!-- 营期已结束：显示完整报告 -->
    <div v-else ref="exportRef" class="p-4 space-y-4">
      <!-- 顶部鼓励卡片 -->
      <div class="bg-gradient-to-br from-[#07C160] to-[#06A952] rounded-2xl p-5 text-white shadow-lg">
        <div class="flex items-center gap-2 mb-3">
          <Trophy class="w-6 h-6" />
          <h2 class="text-lg font-bold">个人营期报告</h2>
        </div>
        <p class="text-sm leading-relaxed opacity-95">{{ encouragement }}</p>
        <div class="flex gap-4 mt-4 text-center">
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ report.summary.totalCheckinDays }}</div>
            <div class="text-[10px] opacity-80">打卡天数</div>
          </div>
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ fmtPct(report.summary.completionRate) }}</div>
            <div class="text-[10px] opacity-80">完成率</div>
          </div>
          <div class="flex-1 bg-white/15 rounded-lg py-2">
            <div class="text-xl font-bold">{{ earnedBadgeCount }}</div>
            <div class="text-[10px] opacity-80">累计徽章</div>
          </div>
        </div>
      </div>

      <!-- 徽章墙（里程碑 / 成就 / 活动，与「我的徽章」同源） -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Award class="h-4 w-4 text-[#FF976A]" />
          徽章墙
          <span class="ml-auto text-xs text-gray-400 font-normal">已点亮 {{ unlockedAchievements.length }}/{{ badgeWall.length }} 种</span>
        </h3>
        <div class="grid grid-cols-4 gap-3">
          <div
            v-for="ach in badgeWall"
            :key="ach.id"
            class="flex flex-col items-center text-center cursor-pointer hover:scale-105 transition-transform"
            :class="ach.unlocked ? '' : 'opacity-30 grayscale'"
            @click="openBadgeInfo(ach)"
          >
            <div class="w-12 h-12 rounded-full flex items-center justify-center text-2xl mb-1"
              :class="ach.unlocked ? 'bg-gradient-to-br from-yellow-100 to-orange-100' : 'bg-gray-100'"
            >{{ ach.icon }}</div>
            <div class="text-[10px] font-medium text-gray-700 leading-tight">{{ ach.title }}</div>
          </div>
        </div>
        <p class="text-[10px] text-gray-400 mt-3 text-center">点击徽章查看说明</p>
      </Card>

      <!-- 体重变化 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <component :is="weightTrendIcon" class="h-4 w-4 text-[#07C160]" />
          体重变化趋势
        </h3>
        <template v-if="report.weightTrend.records.length > 0">
          <div class="flex items-center justify-between mb-4">
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">开营前</div>
              <div class="text-xl font-bold text-gray-900">{{ fmt(report.weightTrend.startWeight) }} <span class="text-xs text-gray-400">kg</span></div>
            </div>
            <div class="flex-1 mx-4 text-center">
              <div class="text-2xl font-bold" :class="report.weightTrend.totalChange !== null && report.weightTrend.totalChange < 0 ? 'text-[#07C160]' : 'text-orange-500'">
                {{ fmtChange(report.weightTrend.totalChange, 'kg') }}
              </div>
              <div class="text-xs text-gray-400 mt-1">{{ report.weightTrend.changePercent !== null ? `${Math.abs(report.weightTrend.changePercent).toFixed(1)}%` : '--' }}</div>
            </div>
            <div class="text-center">
              <div class="text-xs text-gray-500 mb-1">结营后</div>
              <div class="text-xl font-bold text-gray-900">{{ fmt(report.weightTrend.endWeight) }} <span class="text-xs text-gray-400">kg</span></div>
            </div>
          </div>
          <!-- SVG 折线图 -->
          <div v-if="svgPoints" class="w-full">
            <svg viewBox="0 0 280 100" class="w-full" preserveAspectRatio="none" style="height: 100px;">
              <defs>
                <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#07C160" stop-opacity="0.2" />
                  <stop offset="100%" stop-color="#07C160" stop-opacity="0" />
                </linearGradient>
              </defs>
              <polygon
                :points="`20,80 ${svgPoints} 260,80`"
                fill="url(#weightGrad)"
              />
              <polyline
                :points="svgPoints"
                fill="none"
                stroke="#07C160"
                stroke-width="2"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <circle
                v-for="(r, i) in report.weightTrend.records"
                :key="i"
                :cx="20 + (i / (report.weightTrend.records.length - 1)) * 240"
                :cy="100 - 20 - ((r.weight - Math.min(...report.weightTrend.records.map(x => x.weight))) / (Math.max(...report.weightTrend.records.map(x => x.weight)) - Math.min(...report.weightTrend.records.map(x => x.weight)) || 1)) * 60"
                r="3"
                fill="#07C160"
              />
            </svg>
          </div>
        </template>
        <div v-else class="text-center text-sm text-gray-400 py-6">暂无体重记录</div>
      </Card>

      <!-- 指标变化（体成分 + 化验 合并为单模块，按分类分组；无营前营后数据则不显示） -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Activity class="h-4 w-4 text-[#1677FF]" />
          检测指标变化
        </h3>
        <div v-if="metricGroups.length" class="space-y-4">
          <div v-for="[catName, items] in metricGroups" :key="catName">
            <div class="text-xs font-bold text-gray-500 mb-1 flex items-center gap-1.5">
              <Activity class="h-3 w-3 text-[#1677FF]" />
              {{ catName }}
            </div>
            <div class="space-y-2">
              <div
                v-for="m in items"
                :key="m.configId"
                class="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-gray-900">{{ m.name }}</div>
                  <div class="text-[10px] text-gray-400">
                    {{ m.beforeValue ?? '--' }} → {{ m.afterValue ?? '--' }} {{ m.unit }}
                    <span v-if="m.normalRange" class="ml-1">参考: {{ m.normalRange }}</span>
                  </div>
                </div>
                <div class="text-right shrink-0 ml-2">
                  <div class="text-sm font-bold" :class="metricChangeColor(m)">
                    {{ metricChangeText(m) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-center text-sm text-gray-400 py-6">本营期暂无指标检测数据</div>
      </Card>

      <!-- 打卡统计 -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-4 flex items-center gap-2 border-b pb-2">
          <Activity class="h-4 w-4 text-[#07C160]" />
          打卡统计
        </h3>
        <div class="grid grid-cols-3 gap-3 text-center mb-4">
          <div class="bg-gray-50 rounded-lg py-3">
            <div class="text-xl font-bold text-gray-900">{{ report.checkinStats.totalCheckinDays }}</div>
            <div class="text-[10px] text-gray-500 mt-1">总打卡天数</div>
          </div>
          <div class="bg-[#07C160]/5 rounded-lg py-3">
            <div class="text-xl font-bold text-[#07C160]">{{ report.checkinStats.completeDays }}</div>
            <div class="text-[10px] text-gray-500 mt-1">完成全部打卡</div>
          </div>
          <div class="bg-orange-50 rounded-lg py-3">
            <div class="text-xl font-bold text-[#FF976A]">{{ report.checkinStats.longestStreak }}</div>
            <div class="text-[10px] text-gray-500 mt-1">最长连续天数</div>
          </div>
        </div>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">饮食打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.dietCheckinDays }} 天 / {{ report.checkinStats.totalDietRecords }} 条</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">运动打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.exerciseCheckinDays }} 天 / {{ report.checkinStats.totalExerciseRecords }} 条</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">体重打卡天数</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.weightCheckinDays }} 天</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">总运动时长</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.totalExerciseDuration }} 分钟</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">饮食总得分</span>
            <span class="text-gray-900 font-medium">{{ report.checkinStats.totalDietScore }} 分</span>
          </div>
        </div>
      </Card>

      <!-- 目标达成度 -->
      <Card v-if="targetInfo">
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b pb-2">
          <Target class="h-4 w-4 text-[#FF976A]" />
          目标达成度
        </h3>
        <div class="flex items-center justify-between mb-2 text-sm">
          <span class="text-gray-500">目标 <span class="font-bold text-gray-900">{{ targetInfo.target }}kg</span></span>
          <span class="text-gray-500">结营 <span class="font-bold text-gray-900">{{ fmt(targetInfo.end) }}kg</span></span>
        </div>
        <div class="w-full bg-gray-100 rounded-full h-3 overflow-hidden mb-2">
          <div
            class="h-full rounded-full bg-gradient-to-r from-[#07C160] to-[#4ade80] transition-all"
            :style="{ width: `${Math.min(targetInfo.progress * 100, 100)}%` }"
          ></div>
        </div>
        <p class="text-xs" :class="targetInfo.achieved ? 'text-[#07C160] font-bold' : 'text-gray-500'">
          <template v-if="targetInfo.achieved">🎉 恭喜达成目标体重！</template>
          <template v-else>达成 {{ Math.round(targetInfo.progress * 100) }}%，距目标还差 {{ targetInfo.remaining?.toFixed(1) }}kg，继续加油！</template>
        </p>
      </Card>

      <!-- 结营寄语（支持多名营养师各自撰写提交，逐条展示带角色姓名，不互相覆盖） -->
      <Card>
        <h3 class="font-bold text-gray-900 mb-3 flex items-center gap-2 border-b border-[#1677FF]/10 pb-2">
          <MessageCircle class="h-4 w-4 text-[#1677FF]" />
          结营寄语
        </h3>
        <div v-if="reportMessages.length > 0" class="space-y-3">
          <div v-for="m in reportMessages" :key="m.id"
               class="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
            <div class="flex items-center gap-2 mb-1.5 flex-wrap">
              <span :class="['text-[10px] font-bold px-2 py-0.5 rounded-full border', roleTag(m).cls]">{{ roleTag(m).badge }}</span>
              <span class="text-xs font-bold text-gray-800">{{ m.name }}</span>
              <span class="ml-auto text-[10px] text-gray-300">{{ formatMsgTime(m.time) }}</span>
            </div>
            <p class="text-sm text-gray-700 leading-relaxed">{{ m.text }}</p>
          </div>
        </div>
        <p v-else class="text-sm text-gray-400 py-2">本营期暂无结营寄语</p>
      </Card>

      <!-- 底部鼓励语 -->
      <div class="text-center py-4">
        <p class="text-sm text-gray-400">
          {{ report.studentName }} · 健康训练营
        </p>
        <p class="text-xs text-gray-300 mt-1">坚持就是胜利，健康是最好的奖励</p>
      </div>
    </div>

    <!-- 徽章详情弹窗（与「我的徽章」同一组件） -->
    <BadgeInfoPopup v-model:show="showBadgeInfo" :config="selectedBadgeCfg" :records="selectedBadgeRecords" :camp-name="campInfo?.name" />

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in studentCamps"
            :key="camp.id"
            @click="selectedCampId = camp.id; showCampPicker = false"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              selectedCampId === camp.id
                ? 'border-[#07C160] bg-green-50 text-[#07C160]'
                : 'border-gray-200 bg-white text-gray-700 active:bg-gray-50',
            ]"
          >
            <div class="flex-1 text-left min-w-0"><span class="font-medium">{{ camp.name }}</span><div class="text-[10px] text-gray-400 mt-0.5">{{ campDateRange(camp) }}</div></div>
            <span
              v-if="camp.status === 'active'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-600"
            >进行中</span>
            <span
              v-else-if="camp.status === 'ended'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500"
            >已结束</span>
            <span
              v-else
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-500"
            >未开始</span>
          </button>
        </div>
      </div>
    </VanPopup>

    <StudentTabbar anchor="dashboard" print-hidden :badge="unreadCount > 0 ? unreadCount : undefined" />
  </div>
</template>

<style>
@media print {
  /* 隐藏不需要打印的元素 */
  .print\:hidden { display: none !important; }
  .custom-nav { display: none !important; }
  .custom-tabbar { display: none !important; }
  .van-overlay { display: none !important; }
  /* 白色背景 */
  body { background: white !important; }
  /* 移除阴影和圆角，节省墨水 */
  .shadow-lg, .shadow-sm, .shadow-md { box-shadow: none !important; }
  /* 避免在卡片内分页 */
  .grid { break-inside: avoid; }
  /* 确保内容占满宽度 */
  .max-w-md { max-width: 100% !important; }
  .mx-auto { margin: 0 !important; }
  .fixed { position: static !important; }
  .overflow-y-auto { overflow: visible !important; }
  .pb-24 { padding-bottom: 1rem !important; }
  .pt-12 { padding-top: 0 !important; }
}
</style>
