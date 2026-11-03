<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAppStore } from '../store/app';
import { thumbUrl } from '../lib/imageThumb';
import { NavBar as VanNavBar, showSuccessToast, showFailToast } from 'vant';
import { StudentTabbar } from './ui';
import { Coins, CheckCircle, Truck, MapPin, User, Phone } from 'lucide-vue-next';
import type { PointProduct } from '../types';

const store = useAppStore();

// 营期上下文
const availableCamps = computed(() => store.user ? store.getStudentCamps(store.user.id) : []);
const activeCampId = computed(() => {
  if (store.selectedCampId && availableCamps.value.some(c => c.id === store.selectedCampId)) {
    return store.selectedCampId;
  }
  const active = availableCamps.value.find(c => c.status === 'active');
  return active?.id || availableCamps.value[0]?.id || null;
});

const availablePoints = computed(() => store.user ? store.getStudentMallPoints(store.user.id, activeCampId.value || undefined) : 0);
const totalEarned = computed(() => store.user ? store.getStudentTotalEarnedPoints(store.user.id, activeCampId.value || undefined) : 0);
const products = computed(() => store.getPointProducts(activeCampId.value || undefined));

// 每人限兑换次数（maxExchange；0/未设置=不限）。已兑换 count 按学员+商品统计（取消的不算）
const myExchangeCount = (productId: string) =>
  (store.getStudentExchanges(store.user?.id || '').filter((e) => e.productId === productId && e.status !== 'cancelled')).length;
const isLimitReached = (product: PointProduct): boolean =>
  !!product.maxExchange && myExchangeCount(product.id) >= product.maxExchange;

// 兑换确认弹窗
const showExchangeModal = ref(false);
const submitting = ref(false); // 兑付防连点：请求期间忽略重复提交
const selectedProduct = ref<PointProduct | null>(null);
const deliveryMethod = ref<'shipped' | 'in-person'>('shipped');
const recipientName = ref('');
const recipientPhone = ref('');
const recipientAddress = ref('');
const formError = ref('');

function openExchange(product: PointProduct) {
  if (availablePoints.value < product.pointsRequired) {
    showFailToast('积分不足');
    return;
  }
  if (product.stock <= 0) {
    showFailToast('已无库存');
    return;
  }
  if (isLimitReached(product)) {
    showFailToast('该商品已达兑换上限');
    return;
  }
  selectedProduct.value = product;
  // 默认选第一个配送方式
  deliveryMethod.value = product.deliveryOptions?.[0] || 'shipped';
  recipientName.value = '';
  recipientPhone.value = '';
  recipientAddress.value = '';
  formError.value = '';
  showExchangeModal.value = true;
}

function confirmExchange() {
  if (!selectedProduct.value || !store.user) return;
  if (submitting.value) return; // 防连点重复提交（重复兑换/重复扣库存/重复扣积分）
  formError.value = '';

  // 邮寄需校验收货信息
  if (deliveryMethod.value === 'shipped') {
    if (!recipientName.value.trim()) { formError.value = '请填写收货人姓名'; return; }
    if (!recipientPhone.value.trim()) { formError.value = '请填写手机号'; return; }
    if (!recipientAddress.value.trim()) { formError.value = '请填写收货地址'; return; }
  }

  submitting.value = true;
  const result = store.exchangePointProduct(
    store.user.id,
    store.user.name,
    selectedProduct.value,
    deliveryMethod.value === 'shipped'
      ? {
          recipientName: recipientName.value.trim(),
          recipientPhone: recipientPhone.value.trim(),
          recipientAddress: recipientAddress.value.trim(),
          deliveryMethod: 'shipped',
        }
      : { deliveryMethod: 'in-person', recipientName: '', recipientPhone: '', recipientAddress: '' },
    activeCampId.value || undefined,
  );
  submitting.value = false;
  if (result) {
    showSuccessToast('兑换成功');
    showExchangeModal.value = false;
    selectedProduct.value = null;
  } else {
    showFailToast('兑换失败');
  }
}

// 未读批注
// 消息未读数（批注 + 系统通知，store 级统一，与各学员页「消息」Tab 角标一致）
const unreadCount = computed(() =>
  store.user?.role === 'student' ? store.getStudentMsgUnreadCount(store.user.id) : 0,
);
</script>

<template>
  <div class="flex min-h-full flex-col font-sans relative bg-[#F7F8FA]">
    <!-- NavBar -->
    <VanNavBar left-arrow @click-left="store.setCurrentView('activity-hub')" title="积分商城" :border="false"
      class="!bg-transparent !pt-[env(safe-area-inset-top)]" />

    <!-- 积分卡片 -->
    <div class="px-5 pt-2">
      <div class="relative rounded-3xl overflow-hidden">
        <div class="absolute inset-0 bg-gradient-to-br from-[#FF976A] via-[#FF6B35] to-[#F59E0B]"></div>
        <div class="absolute -top-10 -right-6 w-32 h-32 rounded-full bg-white/15 blur-2xl"></div>
        <div class="absolute -bottom-8 -left-4 w-28 h-28 rounded-full bg-white/10 blur-2xl"></div>

        <div class="relative z-10 p-5">
          <div class="flex items-center gap-2 mb-3">
            <Coins class="w-4 h-4 text-white/80" />
            <span class="text-xs text-white/80 font-medium">我的积分</span>
          </div>

          <div class="flex items-end gap-2 mb-2">
            <span class="text-[44px] leading-none font-black text-white tracking-tight">{{ availablePoints }}</span>
            <span class="text-sm text-white/80 font-medium mb-1.5">可用</span>
          </div>

          <div class="flex items-center gap-3">
            <span class="text-[11px] text-white/70">累计获得 {{ totalEarned }} 积分</span>
            <span class="text-[11px] text-white/50">·</span>
            <span class="text-[11px] text-white/70">打卡自动累积，不可转让</span>
          </div>
        </div>
      </div>

      <!-- 积分规则提示 -->
      <div class="mt-3 flex items-start gap-2 bg-white rounded-2xl p-3 border border-gray-100">
        <div class="w-7 h-7 rounded-lg bg-[#FFF4ED] flex items-center justify-center shrink-0 mt-0.5">
          <Coins class="w-3.5 h-3.5 text-[#FF976A]" />
        </div>
        <div class="text-[11px] text-gray-500 leading-relaxed">
          <span class="font-bold text-gray-700">积分规则：</span>
          与排行榜积分规则一致--饮食每日按营养师评分累计（上限6分/天），运动≥40分钟记1分+营养师评分加分。兑换不影响排名成绩。
        </div>
      </div>
    </div>

    <!-- 商品列表 -->
    <div class="flex-1 px-5 mt-4 pb-28">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-sm font-black text-gray-900">可兑换商品</h2>
        <span class="text-[11px] text-gray-400">{{ products.length }} 件</span>
      </div>

      <div v-if="products.length === 0" class="flex flex-col items-center justify-center py-20">
        <div class="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Coins class="w-8 h-8 text-gray-300" />
        </div>
        <p class="text-sm text-gray-400">暂无可兑换商品</p>
        <p class="text-[11px] text-gray-400 mt-1">营养师正在准备中，敬请期待</p>
      </div>

      <div v-else class="grid grid-cols-2 gap-3">
        <div v-for="product in products" :key="product.id"
          class="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm cursor-pointer active:scale-[0.97] transition-transform"
          @click="openExchange(product)"
        >
          <div class="aspect-square bg-gray-50 relative overflow-hidden">
            <img :src="thumbUrl(product.imageUrl, 200)" class="w-full h-full object-cover" :alt="product.name" loading="lazy" decoding="async" />
            <div v-if="product.stock <= 5 && product.stock > 0"
              class="absolute top-2 right-2 bg-[#FF4444] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              仅剩{{ product.stock }}件
            </div>
            <div v-if="product.stock === 0"
              class="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span class="text-white text-sm font-bold">已兑完</span>
            </div>
            <!-- 配送方式标签 -->
            <div class="absolute bottom-2 left-2 flex gap-1">
              <span v-if="product.deliveryOptions?.includes('shipped')" class="bg-[#1677FF]/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">邮寄</span>
              <span v-if="product.deliveryOptions?.includes('in-person')" class="bg-[#07C160]/90 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">线下</span>
            </div>
          </div>

          <div class="p-3">
            <h3 class="text-[13px] font-bold text-gray-900 truncate">{{ product.name }}</h3>
            <p class="text-[10px] text-gray-400 mt-0.5 line-clamp-2 leading-tight">{{ product.description }}</p>
            <div v-if="product.maxExchange" class="text-[10px] font-bold text-[#FF6B35] mt-1">
              每人限兑 {{ product.maxExchange }} 次
            </div>

            <div class="flex items-center justify-between mt-2">
              <div class="flex items-baseline gap-1">
                <Coins class="w-3.5 h-3.5 text-[#FF976A]" />
                <span class="text-base font-black text-[#FF6B35]">{{ product.pointsRequired }}</span>
                <span class="text-[9px] text-gray-400">积分</span>
              </div>
              <button
                :disabled="product.stock === 0 || availablePoints < product.pointsRequired || isLimitReached(product)"
                :class="[
                  'text-[11px] font-bold px-3 py-1 rounded-full transition-colors',
                  product.stock === 0
                    ? 'bg-gray-100 text-gray-300'
                    : isLimitReached(product)
                      ? 'bg-gray-100 text-gray-300'
                      : availablePoints < product.pointsRequired
                        ? 'bg-gray-100 text-gray-400'
                        : 'bg-[#FF6B35] text-white active:bg-[#E55A2B]'
                ]"
              >
                {{ product.stock === 0 ? '已兑完' : isLimitReached(product) ? '已兑满' : availablePoints < product.pointsRequired ? '积分不足' : '兑换' }}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- 兑换确认弹窗（居中） -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showExchangeModal" class="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-6" @click="showExchangeModal = false">
          <div v-if="selectedProduct" class="bg-white rounded-3xl w-full max-w-[360px] overflow-hidden shadow-xl max-h-[90vh] overflow-y-auto" @click.stop>
            <!-- 商品图片 -->
            <div class="aspect-video bg-gray-50 relative">
              <img :src="selectedProduct.imageUrl" class="w-full h-full object-cover" :alt="selectedProduct.name" loading="lazy" decoding="async" />
              <div class="absolute top-3 right-3 bg-white/90 backdrop-blur-sm rounded-full px-2.5 py-1 flex items-center gap-1">
                <Coins class="w-3.5 h-3.5 text-[#FF976A]" />
                <span class="text-xs font-black text-[#FF6B35]">{{ selectedProduct.pointsRequired }}</span>
              </div>
            </div>

            <div class="p-5">
              <h3 class="text-base font-black text-gray-900">{{ selectedProduct.name }}</h3>
              <p class="text-xs text-gray-500 mt-1 leading-relaxed">{{ selectedProduct.description }}</p>

              <!-- 积分明细 -->
              <div class="mt-3 bg-[#FFF8F4] rounded-2xl p-3 space-y-2">
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-500">兑换积分</span>
                  <span class="text-sm font-black text-[#FF6B35]">{{ selectedProduct.pointsRequired }} 分</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-xs text-gray-500">当前积分</span>
                  <span class="text-sm font-bold text-gray-700">{{ availablePoints }} 分</span>
                </div>
                <div class="border-t border-[#FF976A]/15 pt-2 flex items-center justify-between">
                  <span class="text-xs text-gray-500">兑换后剩余</span>
                  <span class="text-sm font-bold text-gray-700">{{ availablePoints - selectedProduct.pointsRequired }} 分</span>
                </div>
              </div>

              <!-- 配送方式选择 -->
              <div v-if="selectedProduct.deliveryOptions && selectedProduct.deliveryOptions.length > 1" class="mt-4">
                <label class="text-sm font-bold text-gray-700 block mb-2">领取方式</label>
                <div class="flex gap-2">
                  <button
                    v-if="selectedProduct.deliveryOptions.includes('shipped')"
                    @click="deliveryMethod = 'shipped'; formError = ''"
                    :class="['flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors flex items-center justify-center gap-1.5',
                      deliveryMethod === 'shipped' ? 'border-[#FF6B35] bg-[#FFF4ED] text-[#FF6B35]' : 'border-gray-200 text-gray-400']"
                  >
                    <Truck class="w-4 h-4" /> 邮寄
                  </button>
                  <button
                    v-if="selectedProduct.deliveryOptions.includes('in-person')"
                    @click="deliveryMethod = 'in-person'; formError = ''"
                    :class="['flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors flex items-center justify-center gap-1.5',
                      deliveryMethod === 'in-person' ? 'border-[#07C160] bg-[#E8F8EE] text-[#07C160]' : 'border-gray-200 text-gray-400']"
                  >
                    <MapPin class="w-4 h-4" /> 线下领取
                  </button>
                </div>
              </div>

              <!-- 邮寄信息表单 -->
              <div v-if="deliveryMethod === 'shipped'" class="mt-4 space-y-3">
                <div>
                  <label class="text-xs font-bold text-gray-600 block mb-1">收货人 <span class="text-red-500">*</span></label>
                  <div class="relative">
                    <User class="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="text" v-model="recipientName" placeholder="请输入姓名"
                      class="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#FF6B35] text-sm" />
                  </div>
                </div>
                <div>
                  <label class="text-xs font-bold text-gray-600 block mb-1">手机号 <span class="text-red-500">*</span></label>
                  <div class="relative">
                    <Phone class="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input type="tel" v-model="recipientPhone" placeholder="请输入手机号" maxlength="11"
                      class="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#FF6B35] text-sm" />
                  </div>
                </div>
                <div>
                  <label class="text-xs font-bold text-gray-600 block mb-1">收货地址 <span class="text-red-500">*</span></label>
                  <div class="relative">
                    <MapPin class="w-4 h-4 text-gray-300 absolute left-3 top-3" />
                    <textarea v-model="recipientAddress" placeholder="请输入详细收货地址" rows="2"
                      class="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[#FF6B35] text-sm resize-none" />
                  </div>
                </div>
              </div>

              <!-- 线下领取提示 -->
              <div v-else class="mt-4 bg-[#E8F8EE] rounded-xl p-3 flex items-center gap-2">
                <CheckCircle class="w-4 h-4 text-[#07C160] shrink-0" />
                <span class="text-[11px] text-gray-600">选择线下领取，营养师确认后到指定地点领取</span>
              </div>

              <div v-if="formError" class="text-red-500 text-xs font-medium text-center mt-3">{{ formError }}</div>

              <div class="flex items-center gap-2 mt-3 text-[10px] text-gray-400">
                <CheckCircle class="w-3.5 h-3.5 text-[#07C160]" />
                <span>兑换后进入待发货，发货前可在"我的奖励"中取消</span>
              </div>

              <div class="flex gap-3 mt-4">
                <button
                  class="flex-1 py-3 rounded-xl text-sm font-bold text-gray-600 bg-gray-100 active:scale-95 transition-transform"
                  @click="showExchangeModal = false"
                >
                  取消
                </button>
                <button
                  :disabled="submitting"
                  :class="['flex-1 py-3 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform', submitting ? 'bg-gray-300' : 'bg-gradient-to-r from-[#FF976A] to-[#FF6B35]']"
                  @click="confirmExchange"
                >
                  {{ submitting ? '提交中…' : '确认兑换' }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Bottom Nav -->
    <StudentTabbar anchor="activity-hub" :badge="unreadCount > 0 ? unreadCount : undefined" />
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
