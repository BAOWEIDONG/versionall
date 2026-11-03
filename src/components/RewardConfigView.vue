<script setup lang="ts">
import { ref, computed } from 'vue';
import { usePaged } from '../composables/usePaged';
import { useAppStore } from '../store/app';
import { campDateRange, latestOrFirstId } from '../lib/camps';
import { NavBar, Card } from './ui';
import { Popup as VanPopup, showToast, showConfirmDialog } from 'vant';
import { Plus, Trash2, Edit3, Camera, AlertTriangle, Coins, ChevronRight } from 'lucide-vue-next';
import { uploadFile } from '../lib/api';
import { compressImage } from '../lib/imageCompress';
import type { RewardTier, PointProduct } from '../types';

const store = useAppStore();

// ─── 营期切换（默认最新营期） ───
const selectedCampId = ref<string>(latestOrFirstId(store.camps) || '');
const showCampPicker = ref(false);
const selectedCamp = computed(() => store.camps.find((c) => c.id === selectedCampId.value));

// 按营期过滤奖励层级和领取记录
const campRewardTiers = computed(() => store.getCampRewardTiers(selectedCampId.value));
const campRewardClaims = computed(() => store.getCampRewardClaims(selectedCampId.value));

const showEditModal = ref(false);
const editingTier = ref<Partial<RewardTier> | null>(null);
const formError = ref('');
/** 编辑既有档位时记录的原始解锁天数；仅用于拦截"已领取后改天数"，防止学员重复领取 */
const originalTierRequiredDays = ref<number | undefined>(undefined);
const photoInputRef = ref<HTMLInputElement | null>(null);

const getClaimCount = (tierId: string) => campRewardClaims.value.filter(c => c.tierId === tierId).length;

// ─── 连续打卡档：库存按「总数量」录入，下方小字展示「库存/已领取」 ───
/** 编辑弹窗里输入的总数量（= 剩余库存 + 已领取）；新建默认 10 */
const tierTotal = ref(10);
/** 该档已领取数（编辑既有档时固定不变；新建为 0） */
const tierClaimed = computed(() => (editingTier.value?.id ? getClaimCount(editingTier.value.id) : 0));
/** 剩余库存 = 总数量 - 已领取 */
const tierRemaining = computed(() => Math.max((tierTotal.value ?? 0) - tierClaimed.value, 0));

const handleEdit = (tier?: RewardTier) => {
  editingTier.value = tier
    ? { ...tier }
    : { name: '', requiredDays: 1, imageUrl: '', description: '', deliveryMethods: ['shipped', 'in-person'], campId: selectedCampId.value };
  originalTierRequiredDays.value = tier ? tier.requiredDays : undefined;
  formError.value = '';
  /* 回填总数量：既有档 = 剩余 + 已领取；新建默认为 10 */
  tierTotal.value = tier ? (tier.stock + getClaimCount(tier.id)) : 10;
  showEditModal.value = true;
};

const handlePhotoSelect = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  const url = await uploadFile(await compressImage(files[0]));
  if (editingTier.value) editingTier.value.imageUrl = url;
  (e.target as HTMLInputElement).value = '';
};

const handleDelete = (id: string) => {
  const claimCount = getClaimCount(id);
  if (claimCount > 0) {
    showToast(`该奖励已有 ${claimCount} 名学员领取，无法删除`);
    return;
  }
  showConfirmDialog({ title: '提示', message: '确定删除此奖励？' }).then(() => {
    const res = store.deleteRewardTier(id);
    if (!res.ok) showToast(res.reason || '删除失败');
    else showToast({ message: '已删除', position: 'top', duration: 2000 });
  });
};

const handleToggleTierActive = (tier: RewardTier) => {
  const goingDown = tier.active !== false; // 当前视为上架 -> 下架
  showConfirmDialog({
    title: goingDown ? '确认下架' : '确认上架',
    message: goingDown
      ? `下架后学员端将不再展示该档位、不可再兑换（已有领取记录不受影响，仍可发货）。确定下架「${tier.name}」吗？`
      : `上架后学员端将恢复展示并可兑换「${tier.name}」，确定上架吗？`,
  }).then(() => {
    store.toggleRewardTierActive(tier.id);
    showToast({ message: goingDown ? '已下架' : '已上架', position: 'top', duration: 2000 });
  });
};

const toggleDeliveryMethod = (method: 'shipped' | 'in-person') => {
  if (!editingTier.value) return;
  const methods = editingTier.value.deliveryMethods || [];
  if (methods.includes(method)) {
    editingTier.value.deliveryMethods = methods.filter(m => m !== method);
  } else {
    editingTier.value.deliveryMethods = [...methods, method];
  }
  formError.value = '';
};

const DELIVERY_LABELS: Record<string, string> = {
  shipped: '邮寄',
  'in-person': '线下领取',
};

const saveTier = () => {
  if (!editingTier.value) return;
  if (!editingTier.value.name?.trim()) { formError.value = '请输入礼品名称'; return; }
  if (!editingTier.value.imageUrl) { formError.value = '请上传礼品图片'; return; }
  if (tierTotal.value === undefined || tierTotal.value < 0) { formError.value = '请输入有效的总数量'; return; }
  if (editingTier.value.id) {
    const c = getClaimCount(editingTier.value.id);
    if (tierTotal.value < c) { formError.value = `总数量不能低于已领取的 ${c} 件（该奖励已有 ${c} 人领取）`; return; }
  }
  // 已有人领取的档位：解锁条件（连续打卡天数）锁定不可修改，防止学员按新天数重复领取
  if (
    editingTier.value.id
    && tierClaimed.value > 0
    && originalTierRequiredDays.value != null
    && editingTier.value.requiredDays !== originalTierRequiredDays.value
  ) {
    formError.value = '该奖励已有学员领取，解锁条件（连续打卡天数）不可修改';
    return;
  }
  // 兜底：已领取档位强制维持原天数
  if (editingTier.value.id && tierClaimed.value > 0 && originalTierRequiredDays.value != null) {
    editingTier.value.requiredDays = originalTierRequiredDays.value;
  }
  if (!editingTier.value.deliveryMethods || editingTier.value.deliveryMethods.length === 0) { formError.value = '请至少选择一种领取方式'; return; }

  const dup = campRewardTiers.value.find(t => t.requiredDays === editingTier.value!.requiredDays && t.id !== editingTier.value!.id);
  if (dup) { formError.value = `已存在连续打卡 ${editingTier.value.requiredDays} 天的奖励（${dup.name}），请设置不同天数`; return; }

  /* 剩余库存 = 总数量 - 已领取 */
  const stock = editingTier.value.id
    ? tierTotal.value - getClaimCount(editingTier.value.id)
    : tierTotal.value;

  if (editingTier.value.id) {
    store.updateRewardTier(editingTier.value.id, { ...editingTier.value, stock, source: 'streak' });
  } else {
    store.addRewardTier({
      id: `t_${Date.now()}`,
      name: editingTier.value.name.trim(),
      requiredDays: editingTier.value.requiredDays!,
      imageUrl: editingTier.value.imageUrl,
      stock,
      source: 'streak',
      description: editingTier.value.description,
      deliveryMethods: editingTier.value.deliveryMethods,
      sortValue: editingTier.value.sortValue || 0,
      campId: selectedCampId.value,
    });
  }
  showEditModal.value = false;
  showToast({ message: editingTier.value.id ? '改动已保存' : '奖品已添加', position: 'top', duration: 2000 });
};

const streakTiers = computed(() =>
  [...campRewardTiers.value]
    .sort((a, b) => a.requiredDays - b.requiredDays)
);
const { items: pagedStreakTiers, hasMore: hasMoreTiers, remaining: remainingTiers, loadMore: loadMoreTiers } = usePaged(streakTiers, 10);

// ─── 积分商城商品管理 ───
/** 积分商城商品：按当前营期过滤（未绑定 campId 视为全局共享，与连续打卡档口径一致） */
const allMallProducts = computed(() => store.pointProducts.filter((p) => !p.campId || p.campId === selectedCampId.value));
const { items: pagedMallProducts, hasMore: hasMoreProducts, remaining: remainingProducts, loadMore: loadMoreProducts } = usePaged(allMallProducts, 10);
const allExchanges = computed(() =>
  [...store.pointExchanges].sort((a, b) => b.exchangeDate.localeCompare(a.exchangeDate))
);
// 上架中奖品需显示已领取（已兑换）数量：= 该商品非取消的兑换次数
const getProductClaimCount = (productId: string) =>
  allExchanges.value.filter(e => e.productId === productId && e.status !== 'cancelled').length;

const showProductModal = ref(false);
const editingProduct = ref<Partial<PointProduct> | null>(null);
const productFormError = ref('');
const productPhotoInputRef = ref<HTMLInputElement | null>(null);

// ─── 积分商品：库存按「总数量」录入，下方小字展示「库存/已领取」 ───
/** 编辑弹窗里输入的总数量（= 剩余库存 + 已领取/已兑换）；新建默认 50 */
const productTotal = ref(50);
/** 已兑换（非取消）数：编辑既有商品时固定不变；新建为 0 */
const productClaimed = computed(() => (editingProduct.value?.id ? getProductClaimCount(editingProduct.value.id) : 0));
/** 剩余库存 = 总数量 - 已兑换 */
const productRemaining = computed(() => Math.max((productTotal.value ?? 0) - productClaimed.value, 0));

const handleProductPhotoSelect = async (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (!files || files.length === 0) return;
  const url = await uploadFile(await compressImage(files[0]));
  if (editingProduct.value) editingProduct.value.imageUrl = url;
  (e.target as HTMLInputElement).value = '';
};

const handleEditProduct = (product?: PointProduct) => {
  editingProduct.value = product
    ? { ...product }
    : { name: '', imageUrl: '', description: '', pointsRequired: 100, active: true, deliveryOptions: ['shipped', 'in-person'], campId: selectedCampId.value };
  productFormError.value = '';
  /* 回填总数量：既有商品 = 剩余 + 已兑换；新建默认为 50 */
  productTotal.value = product ? (product.stock + getProductClaimCount(product.id)) : 50;
  showProductModal.value = true;
};

const handleDeleteProduct = (id: string) => {
  const hasExchanges = allExchanges.value.some(e => e.productId === id && e.status !== 'cancelled');
  if (hasExchanges) {
    showToast('该商品已有兑换记录，无法删除');
    return;
  }
  showConfirmDialog({ title: '提示', message: '确定删除此商品？' }).then(() => {
    const res = store.deletePointProduct(id);
    if (!res.ok) showToast(res.reason || '删除失败');
    else showToast({ message: '已删除', position: 'top', duration: 2000 });
  });
};

const saveProduct = () => {
  if (!editingProduct.value) return;
  if (!editingProduct.value.name?.trim()) { productFormError.value = '请输入商品名称'; return; }
  if (!editingProduct.value.imageUrl) { productFormError.value = '请上传商品图片'; return; }
  if (!editingProduct.value.pointsRequired || editingProduct.value.pointsRequired <= 0) { productFormError.value = '请输入有效的积分'; return; }
  if (productTotal.value === undefined || productTotal.value < 0) { productFormError.value = '请输入有效的总数量'; return; }
  if (editingProduct.value.id) {
    const c = getProductClaimCount(editingProduct.value.id);
    if (productTotal.value < c) { productFormError.value = `总数量不能低于已兑换的 ${c} 件（已有 ${c} 人兑换）`; return; }
  }
  const maxExchange = editingProduct.value.maxExchange;
  if (maxExchange !== 0 && (maxExchange === undefined || maxExchange < 0)) { productFormError.value = '请输入有效的限兑次数'; return; }

  /* 剩余库存 = 总数量 - 已兑换 */
  const stock = editingProduct.value.id
    ? productTotal.value - getProductClaimCount(editingProduct.value.id)
    : productTotal.value;

  if (editingProduct.value.id) {
    store.updatePointProduct(editingProduct.value.id, { ...editingProduct.value, stock });
  } else {
    store.addPointProduct({
      id: `pp_${Date.now()}`,
      name: editingProduct.value.name.trim(),
      imageUrl: editingProduct.value.imageUrl,
      description: editingProduct.value.description || '',
      pointsRequired: editingProduct.value.pointsRequired,
      stock,
      active: true,
      deliveryOptions: editingProduct.value.deliveryOptions || ['shipped', 'in-person'],
      // 每人限兑换次数：0 / 不填 = 不限
      maxExchange: maxExchange && maxExchange > 0 ? maxExchange : undefined,
      sortValue: editingProduct.value.sortValue || 0,
      campId: editingProduct.value.campId,
    });
  }
  showProductModal.value = false;
  showToast({ message: editingProduct.value.id ? '改动已保存' : '商品已添加', position: 'top', duration: 2000 });
};

const toggleProductActive = (product: PointProduct) => {
  // 下架需二次确认，防误下架；已有领取/兑换时明示连带影响
  if (product.active) {
    const claimed = getProductClaimCount(product.id);
    const pending = allExchanges.value.filter((e) => e.productId === product.id && e.status === 'pending').length;
    const impact =
      claimed > 0
        ? `该商品已有 ${claimed} 件被领取${pending > 0 ? `（其中 ${pending} 件待发放）` : ''}。下架后学员端不再展示、不可再兑换，但已产生的兑换记录不受影响，仍可在「兑换记录与发货管理」中发货。`
        : '下架后学员端将不再展示该商品，学员不可再兑换。';
    showConfirmDialog({ title: '确认下架', message: `${impact} 确定下架吗？` })
      .then(() => { store.updatePointProduct(product.id, { active: false }); showToast({ message: '已下架', position: 'top', duration: 2000 }); })
      .catch(() => {});
    return;
  }
  store.updatePointProduct(product.id, { active: true });
  showToast({ message: '已上架', position: 'top', duration: 2000 });
};

function toggleDeliveryOption(option: 'shipped' | 'in-person') {
  if (!editingProduct.value) return;
  const current = editingProduct.value.deliveryOptions || [];
  if (current.includes(option)) {
    // 至少保留一个
    if (current.length > 1) {
      editingProduct.value.deliveryOptions = current.filter(o => o !== option);
    }
  } else {
    editingProduct.value.deliveryOptions = [...current, option];
  }
}
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] relative">
    <NavBar title="奖励配置" :on-back="store.goBack" />

    <!-- 营期切换 -->
    <div class="bg-white px-4 py-3 flex items-center justify-between border-b border-gray-100">
      <div>
        <div class="text-xs text-gray-500">当前营期</div>
        <div class="text-sm font-medium text-gray-800">{{ selectedCamp?.name || '未选择' }}</div>
      </div>
      <button class="text-xs text-[#FF976A] border border-[#FF976A] px-3 py-1.5 rounded-full font-bold active:bg-orange-50" @click="showCampPicker = true">
        切换营期
      </button>
    </div>

    <div class="flex-1 p-4 space-y-6 pb-24">
      <!-- 打卡奖励 -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <div class="w-1.5 h-4 bg-[#1677FF] rounded-full"></div>
            连续打卡奖励
          </h3>
          <button @click="handleEdit()" class="text-xs font-bold text-[#1677FF] flex items-center gap-0.5">
            <Plus class="w-3.5 h-3.5" /> 添加
          </button>
        </div>
        <div v-if="streakTiers.length === 0" class="text-center py-8 text-gray-400 text-xs bg-white rounded-xl border border-gray-100">暂无打卡奖励，请添加</div>
        <div class="space-y-3">
          <Card v-for="tier in pagedStreakTiers" :key="tier.id" class="p-4 flex gap-4">
            <div class="w-20 h-20 rounded-xl bg-gray-100 shrink-0 overflow-hidden border border-gray-50 cursor-pointer" @click="store.openImagePreview([tier.imageUrl], 0)">
              <img loading="lazy" decoding="async" :src="tier.imageUrl" :alt="tier.name" class="w-full h-full object-cover" />
            </div>
            <div class="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <div class="flex justify-between items-start">
                  <h3 class="font-bold text-gray-900 text-base truncate pr-2">{{ tier.name }}</h3>
                  <div class="flex gap-2 shrink-0">
                    <button @click="handleToggleTierActive(tier)" :class="['p-1', tier.active === false ? 'text-[#07C160]' : 'text-[#FF976A]']"><AlertTriangle class="w-4 h-4" /></button>
                    <button @click="handleEdit(tier)" class="text-blue-500 p-1"><Edit3 class="w-4 h-4" /></button>
                    <button @click="handleDelete(tier.id)" :class="['p-1', getClaimCount(tier.id) > 0 ? 'text-gray-300 cursor-not-allowed' : 'text-red-500']"><Trash2 class="w-4 h-4" /></button>
                  </div>
                </div>
                <div class="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded inline-block mt-1">连续打卡 {{ tier.requiredDays }} 天</div>
                  <span class="inline-block ml-1 text-[10px] px-1.5 py-0.5 rounded font-bold mt-1" :class="tier.active === false ? 'bg-gray-200 text-gray-500' : 'bg-[#07C160]/10 text-[#07C160]'">{{ tier.active === false ? '已下架' : '上架中' }}</span>
                <div class="flex flex-wrap items-center gap-1 mt-1">
                  <span v-for="m in (tier.deliveryMethods || ['shipped'])" :key="m" class="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{{ DELIVERY_LABELS[m] }}</span>
                  <span v-if="tier.sortValue" class="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">排序 {{ tier.sortValue }}</span>
                  <span v-if="tier.version && tier.version > 1" class="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">v{{ tier.version }}</span>
                </div>
                <!-- 礼品描述（营养师配置，与积分商品一致，单行截断） -->
                <div v-if="tier.description" class="text-[10px] text-gray-500 mt-1 truncate">{{ tier.description }}</div>
                <div class="flex items-center gap-2">
                  <div class="text-xs text-gray-500 font-medium">库存: <span :class="tier.stock > 0 ? 'text-gray-900' : 'text-red-500'">{{ tier.stock }}</span> 件</div>
                  <!-- 已领取橙色标识，样式与积分商品一致（位于库存右侧） -->
                  <span v-if="getClaimCount(tier.id) > 0" class="text-[10px] font-bold text-[#FF6B35] bg-[#FFF4ED] px-1.5 py-0.5 rounded-full">已领取 {{ getClaimCount(tier.id) }} 件</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
        <button v-if="hasMoreTiers" @click="loadMoreTiers" class="w-full py-2.5 mt-1 text-xs font-bold text-[#FF976A] bg-white border border-[#FF976A]/30 rounded-xl active:bg-orange-50">
          加载更多打卡奖励（还有 {{ remainingTiers }} 档）
        </button>
      </div>

      <!-- 积分商城商品（按当前营期过滤；未绑定营期视为全局共享） -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-bold text-gray-900 flex items-center gap-1.5">
            <div class="w-1.5 h-4 bg-[#FF976A] rounded-full"></div>
            积分商城商品
          </h3>
          <button @click="handleEditProduct()" class="text-xs font-bold text-[#FF976A] flex items-center gap-0.5">
            <Plus class="w-3.5 h-3.5" /> 添加
          </button>
        </div>
        <p class="text-[10px] text-gray-400 mb-3">商品随当前营期展示，各营期可配置不同商品。新增商品绑定当前营期。学员通过打卡累积积分兑换当前营期商品。</p>
        <div v-if="allMallProducts.length === 0" class="text-center py-8 text-gray-400 text-xs bg-white rounded-xl border border-gray-100">暂无商品，请添加</div>
        <div class="space-y-3">
          <Card v-for="product in pagedMallProducts" :key="product.id" class="p-4 flex gap-4">
            <div class="w-20 h-20 rounded-xl bg-gray-100 shrink-0 overflow-hidden border border-gray-50 cursor-pointer" @click="store.openImagePreview([product.imageUrl], 0)">
              <img loading="lazy" decoding="async" :src="product.imageUrl" :alt="product.name" class="w-full h-full object-cover" />
            </div>
            <div class="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <div class="flex justify-between items-start">
                  <h3 class="font-bold text-gray-900 text-base truncate pr-2">{{ product.name }}</h3>
                  <div class="flex gap-2 shrink-0">
                    <button @click="toggleProductActive(product)" :class="['p-1', product.active ? 'text-[#FF976A]' : 'text-[#07C160]']" :title="product.active ? '下架' : '上架'"><AlertTriangle class="w-4 h-4" /></button>
                    <button @click="handleEditProduct(product)" class="text-blue-500 p-1"><Edit3 class="w-4 h-4" /></button>
                    <button @click="handleDeleteProduct(product.id)" :class="['p-1', allExchanges.some(e => e.productId === product.id && e.status !== 'cancelled') ? 'text-gray-300 cursor-not-allowed' : 'text-red-500']"><Trash2 class="w-4 h-4" /></button>
                  </div>
                </div>
                <div class="flex items-center gap-1 mt-1">
                  <Coins class="w-3.5 h-3.5 text-[#FF976A]" />
                  <span class="text-xs font-black text-[#FF6B35]">{{ product.pointsRequired }}</span>
                  <span class="text-[10px] text-gray-400">积分</span>
                  <!-- 上架/下架状态纯标签展示，与连续打卡一致（操作在其右侧单独按钮） -->
                  <span class="inline-block text-[10px] px-1.5 py-0.5 rounded font-bold" :class="product.active === false ? 'bg-gray-200 text-gray-500' : 'bg-[#07C160]/10 text-[#07C160]'">{{ product.active === false ? '已下架' : '上架中' }}</span>
                  <span v-if="product.sortValue" class="ml-1 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">排序 {{ product.sortValue }}</span>
                  <span v-if="product.productVersion && product.productVersion > 1" class="text-[10px] text-gray-400">v{{ product.productVersion }}</span>
                </div>
                <div v-if="product.description" class="text-[10px] text-gray-500 mt-1 truncate">{{ product.description }}</div>
              </div>
              <div class="flex items-center gap-2">
                <div class="text-xs text-gray-500 font-medium">库存: <span :class="product.stock > 0 ? 'text-gray-900' : 'text-red-500'">{{ product.stock }}</span> 件</div>
                <!-- 上架中的商品显示已领取（已兑换）数量 -->
                <span v-if="product.active" class="text-[10px] font-bold text-[#FF6B35] bg-[#FFF4ED] px-1.5 py-0.5 rounded-full">已领取 {{ getProductClaimCount(product.id) }} 件</span>
              </div>
            </div>
          </Card>
        </div>
        <button v-if="hasMoreProducts" @click="loadMoreProducts" class="w-full py-2.5 mt-1 text-xs font-bold text-[#FF976A] bg-white border border-[#FF976A]/30 rounded-xl active:bg-orange-50">
          加载更多商品（还有 {{ remainingProducts }} 个）
        </button>
      </div>

      <!-- 配置操作记录（审计） -->
      <div>
        <div class="flex items-center justify-between mb-2.5 mt-6">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-gray-400 rounded-full"></div>
            <h2 class="text-sm font-black text-gray-900">配置操作记录</h2>
          </div>
          <span class="text-[10px] text-gray-400">{{ store.configAudits.length }} 条</span>
        </div>
        <Card class="p-3">
          <div v-if="store.configAudits.length === 0" class="text-center py-6 text-[11px] text-gray-400">暂无配置操作记录</div>
          <div v-else class="space-y-2 max-h-[260px] overflow-y-auto">
            <div v-for="a in store.configAudits.slice(0, 30)" :key="a.id" class="flex items-start gap-2 text-[11px] py-1 border-b border-gray-50 last:border-0">
              <span :class="['shrink-0 px-1.5 py-0.5 rounded-full font-bold',
                a.module === 'tier' ? (a.action === '新增' ? 'bg-blue-50 text-[#1677FF]' : a.action === '删除' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500')
              : (a.action === '新增' ? 'bg-orange-50 text-[#FF976A]' : a.action === '删除' ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500')]">
                {{ a.module === 'tier' ? '档位' : '商品' }}{{ a.action }}
              </span>
              <div class="flex-1 min-w-0 leading-snug">
                <div class="text-gray-700 truncate"><span class="text-gray-400">{{ a.operator }}</span> · {{ a.targetName }}<span v-if="a.after"> → {{ a.after }}</span></div>
                <div class="text-gray-400 truncate mt-0.5">{{ a.operatorTime }}<template v-if="a.before"> · {{ a.before }}</template><template v-if="a.reason"> · {{ a.reason }}</template></div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <!-- 兑换记录入口 -->
      <div>
        <button class="w-full flex items-center justify-between bg-white rounded-2xl border border-gray-100 p-4 active:bg-gray-50 transition-colors" @click="store.setCurrentView('fulfillment-center')">
          <div class="flex items-center gap-2">
            <div class="w-1.5 h-4 bg-[#07C160] rounded-full"></div>
            <div class="text-left">
              <div class="text-sm font-bold text-gray-900">兑换记录与发货管理</div>
              <div class="text-[10px] text-gray-400">查看兑换记录、奖励发货、发放记录</div>
            </div>
          </div>
          <ChevronRight class="w-5 h-5 text-gray-300" />
        </button>
      </div>
    </div>

    <!-- Edit popup -->
    <VanPopup v-model:show="showEditModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5" v-if="editingTier">
        <h3 class="text-lg font-bold text-gray-900 mb-5">{{ editingTier.id ? '编辑奖励' : '新增奖励' }}</h3>
        <!-- 已有领取记录警告 -->
        <div v-if="editingTier.id && getClaimCount(editingTier.id) > 0" class="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <AlertTriangle class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div class="text-xs text-amber-700">
            <div class="font-bold mb-0.5">该奖励已有 {{ getClaimCount(editingTier.id) }} 人领取</div>
            <div>已领取后「解锁条件（连续打卡天数）」不可再修改（防止学员重复领取）。礼品名称、总数量可安全修改。</div>
          </div>
        </div>
        <div class="space-y-4 mb-6">
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">礼品图片 <span class="text-red-500">*</span></label>
            <input ref="photoInputRef" type="file" accept="image/*" class="hidden" @change="handlePhotoSelect" />
            <div class="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 overflow-hidden" @click="photoInputRef?.click()">
              <img loading="lazy" decoding="async" v-if="editingTier.imageUrl" :src="editingTier.imageUrl" class="w-full h-full object-cover" />
              <template v-else><Camera class="w-6 h-6 text-gray-400 mb-1" /><span class="text-[10px] text-gray-400">上传图片</span></template>
            </div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">礼品名称 <span class="text-red-500">*</span></label>
            <input type="text" placeholder="如：运动水杯" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" v-model="editingTier.name" @input="formError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">礼品描述</label>
            <textarea placeholder="如：不锈钢运动水杯，容量 500ml" rows="2" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm resize-none" v-model="editingTier.description"></textarea>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">解锁条件 (连续打卡天数) <span class="text-red-500">*</span></label>
            <input
              type="number" inputmode="numeric" placeholder="如：10" min="1"
              :disabled="tierClaimed > 0"
              :class="['w-full px-3 py-2 rounded-lg focus:outline-none text-sm', tierClaimed > 0 ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-50 border border-gray-200 focus:border-[#1677FF]']"
              :value="editingTier.requiredDays"
              @input="editingTier.requiredDays = parseInt(($event.target as HTMLInputElement).value) || 0; formError = ''"
            />
            <div v-if="tierClaimed > 0" class="text-[11px] text-amber-600 mt-1">已有 {{ tierClaimed }} 人领取，解锁条件不可修改</div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">总数量 <span class="text-red-500">*</span></label>
            <input type="number" inputmode="numeric" placeholder="如：50" min="0" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" :value="tierTotal" @input="tierTotal = parseInt(($event.target as HTMLInputElement).value) || 0; formError = ''" />
            <div class="text-[11px] text-gray-400 mt-1">库存 {{ tierRemaining }} 件 · 已领取 {{ tierClaimed }} 件</div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">排序值 <span class="text-xs text-gray-400 font-normal">（越小越靠前，默认 0）</span></label>
            <input type="number" inputmode="numeric" placeholder="如：1" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#1677FF] text-sm" :value="editingTier.sortValue" @input="editingTier.sortValue = parseInt(($event.target as HTMLInputElement).value) || 0; formError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">领取方式 <span class="text-red-500">*</span></label>
            <p class="text-[10px] text-gray-400 mb-2">学员领取时从中选择，可多选</p>
            <div class="flex gap-2">
              <button
                :class="['flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors', editingTier.deliveryMethods?.includes('shipped') ? 'border-[#1677FF] bg-[#1677FF]/5 text-[#1677FF]' : 'border-gray-200 text-gray-500']"
                @click="toggleDeliveryMethod('shipped')"
              >邮寄</button>
              <button
                :class="['flex-1 py-2.5 rounded-lg text-xs font-bold border transition-colors', editingTier.deliveryMethods?.includes('in-person') ? 'border-[#FF976A] bg-[#FF976A]/5 text-[#FF976A]' : 'border-gray-200 text-gray-500']"
                @click="toggleDeliveryMethod('in-person')"
              >线下领取</button>
            </div>
          </div>
          <div v-if="formError" class="text-red-500 text-xs font-medium text-center">{{ formError }}</div>
        </div>
        <button class="w-full py-3 rounded-xl bg-[#1677FF] text-white font-bold" @click="saveTier">保存配置</button>
      </div>
    </VanPopup>

    <!-- 商品编辑弹窗 -->
    <VanPopup v-model:show="showProductModal" position="bottom" round :style="{ maxHeight: '90%' }">
      <div class="p-5" v-if="editingProduct">
        <h3 class="text-lg font-bold text-gray-900 mb-5">{{ editingProduct.id ? '编辑商品' : '新增商品' }}</h3>
        <div class="space-y-4 mb-6">
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">商品图片 <span class="text-red-500">*</span></label>
            <input ref="productPhotoInputRef" type="file" accept="image/*" class="hidden" @change="handleProductPhotoSelect" />
            <div class="w-24 h-24 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 overflow-hidden" @click="productPhotoInputRef?.click()">
              <img loading="lazy" decoding="async" v-if="editingProduct.imageUrl" :src="editingProduct.imageUrl" class="w-full h-full object-cover" />
              <template v-else><Camera class="w-6 h-6 text-gray-400 mb-1" /><span class="text-[10px] text-gray-400">上传图片</span></template>
            </div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">商品名称 <span class="text-red-500">*</span></label>
            <input type="text" placeholder="如：运动水杯" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" v-model="editingProduct.name" @input="productFormError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">商品描述</label>
            <textarea placeholder="简要描述商品特点" rows="2" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm resize-none" v-model="editingProduct.description"></textarea>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">所需积分 <span class="text-red-500">*</span></label>
            <input type="number" inputmode="numeric" placeholder="如：200" min="1" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" :value="editingProduct.pointsRequired" @input="editingProduct.pointsRequired = parseInt(($event.target as HTMLInputElement).value) || 0; productFormError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">总数量 <span class="text-red-500">*</span></label>
            <input type="number" inputmode="numeric" placeholder="如：50" min="0" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" :value="productTotal" @input="productTotal = parseInt(($event.target as HTMLInputElement).value) || 0; productFormError = ''" />
            <div class="text-[11px] text-gray-400 mt-1">库存 {{ productRemaining }} 件 · 已领取 {{ productClaimed }} 件</div>
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">每人限兑次数 <span class="text-xs text-gray-400 font-normal">（填 0 表示不限制）</span></label>
            <input type="number" inputmode="numeric" placeholder="如：1" min="0" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" :value="editingProduct.maxExchange" @input="editingProduct.maxExchange = parseInt(($event.target as HTMLInputElement).value) || 0; productFormError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-1">排序值 <span class="text-xs text-gray-400 font-normal">（越小越靠前，默认 0）</span></label>
            <input type="number" inputmode="numeric" placeholder="如：1" class="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-[#FF976A] text-sm" :value="editingProduct.sortValue" @input="editingProduct.sortValue = parseInt(($event.target as HTMLInputElement).value) || 0; productFormError = ''" />
          </div>
          <div>
            <label class="text-sm font-medium text-gray-700 block mb-2">配送方式</label>
            <div class="flex gap-2">
              <button
                @click="toggleDeliveryOption('shipped')"
                :class="['flex-1 py-2 rounded-lg text-xs font-bold border transition-colors',
                  editingProduct.deliveryOptions?.includes('shipped') ? 'border-[#FF976A] bg-orange-50 text-[#FF976A]' : 'border-gray-200 text-gray-400']"
              >邮寄</button>
              <button
                @click="toggleDeliveryOption('in-person')"
                :class="['flex-1 py-2 rounded-lg text-xs font-bold border transition-colors',
                  editingProduct.deliveryOptions?.includes('in-person') ? 'border-[#07C160] bg-green-50 text-[#07C160]' : 'border-gray-200 text-gray-400']"
              >线下领取</button>
            </div>
          </div>
          <div v-if="productFormError" class="text-red-500 text-xs font-medium text-center">{{ productFormError }}</div>
        </div>
        <div class="flex gap-3">
          <button class="flex-1 py-3 rounded-xl bg-gray-100 text-gray-600 font-bold active:scale-95 transition-transform" @click="showProductModal = false">取消</button>
          <button class="flex-1 py-3 rounded-xl bg-[#FF976A] text-white font-bold active:scale-95 transition-transform" @click="saveProduct">保存</button>
        </div>
      </div>
    </VanPopup>

    <!-- 营期选择弹窗 -->
    <VanPopup v-model:show="showCampPicker" position="bottom" round>
      <div class="p-4">
        <h3 class="font-bold text-gray-900 text-base mb-3 text-center">选择营期</h3>
        <div class="space-y-2">
          <button
            v-for="camp in store.camps"
            :key="camp.id"
            @click="selectedCampId = camp.id; showCampPicker = false"
            :class="[
              'w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all',
              selectedCampId === camp.id
                ? 'border-[#FF976A] bg-orange-50 text-[#FF976A]'
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
  </div>
</template>
