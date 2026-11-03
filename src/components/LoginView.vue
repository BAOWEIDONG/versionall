<script setup lang="ts">
import { ref } from 'vue';
import { showDialog, Checkbox as VanCheckbox, showToast } from 'vant';
import { useAppStore, isQuestionnaireSubmitted } from '../store/app';
import { Button, NavBar } from './ui';
import { MessageCircle, UserCircle, Dumbbell, Leaf, Activity } from 'lucide-vue-next';
import type { Role } from '../types';

const store = useAppStore();
const step = ref<1 | 2>(1);
const phone = ref('');
const code = ref('');
const role = ref<Role>('student');
const agreed = ref(false);
const error = ref('');

const showAgreement = () => showDialog({ title: '服务协议', message: '服务协议详细内容' });
const showPrivacy = () => showDialog({ title: '隐私政策', message: '隐私政策详细内容' });

const handleWeChatLogin = () => {
  setTimeout(() => {
    step.value = 2;
    error.value = '';
  }, 1000);
};

const handlePhoneSubmit = () => {
  if (!agreed.value) {
    error.value = '请先勾选同意《服务协议》与《隐私政策》';
    return;
  }
  if (phone.value.length !== 11 || code.value.length !== 6) {
    error.value = '请输入正确的11位手机号和6位验证码';
    return;
  }

  // 校验：手机号必须在账户管理中已配置且角色匹配、状态启用
  const account = store.accounts.find(
    (a) => a.phone === phone.value && a.role === role.value && a.active,
  );

  if (!account) {
    // 尝试找到该手机号但角色不匹配的账户，给出更精确的提示
    const wrongRoleAccount = store.accounts.find((a) => a.phone === phone.value && a.active);
    if (wrongRoleAccount) {
      const roleLabel = wrongRoleAccount.role === 'student' ? '学员' : wrongRoleAccount.role === 'coach' ? '教练' : '营养师';
      error.value = `该手机号已注册为${roleLabel}，请切换角色后登录`;
    } else {
      const inactiveAccount = store.accounts.find((a) => a.phone === phone.value);
      if (inactiveAccount) {
        error.value = '该账户已被禁用，请联系营养师启用';
      } else {
        error.value = '该手机号未在系统中配置，请联系营养师添加账户';
      }
    }
    return;
  }

  error.value = '';
  // 从 students 列表补充 gender/age 信息
  const studentInfo = store.students.find((s) => s.id === account.id);
  store.setUser({
    id: account.id,
    role: account.role,
    name: account.name,
    phone: account.phone,
    gender: studentInfo?.gender,
    age: studentInfo?.age,
    supervisor: account.supervisor === true,
  });
  const roleLabel = account.role === 'dietitian' ? '营养师' : account.role === 'coach' ? '教练' : '学员';
  showToast(`欢迎回来${account.name ? '，' + roleLabel + ' ' + account.name : '，' + roleLabel}`);

  if (account.role === 'coach') store.setCurrentView('coach-dashboard');
  else if (account.role === 'dietitian') store.setCurrentView('dietitian-dashboard');
  else store.setCurrentView(isQuestionnaireSubmitted(account.id) ? 'dashboard' : 'questionnaire');
};
</script>

<template>
  <div v-if="step === 1" class="flex flex-col bg-gradient-to-b from-[#F7F8FA] to-white" style="min-height: 100vh; min-height: 100dvh;">
    <NavBar title="授权登录" />
    <div class="flex flex-1 flex-col items-center justify-center p-6 space-y-10">
      <div class="flex flex-col items-center space-y-4 mt-4">
        <div class="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-[#07C160] to-[#04a551] shadow-lg shadow-[#07C160]/30">
          <Activity class="h-12 w-12 text-white" />
        </div>
        <h1 class="text-[26px] font-bold tracking-tight text-gray-900">健康训练营</h1>
        <p class="text-gray-500 text-center text-sm px-4 leading-relaxed">科学减脂，专业指导，开启你的健康蜕变之旅</p>
      </div>

      <div class="w-full space-y-4">
        <div class="grid grid-cols-3 gap-3 mb-8">
          <button
            @click="role = 'student'"
            :class="['flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all', role === 'student' ? 'border-[#07C160] bg-[#07C160]/5' : 'border-gray-100 bg-white hover:border-[#07C160]/30']"
          >
            <div :class="['p-2 rounded-full mb-2', role === 'student' ? 'bg-[#07C160] text-white' : 'bg-gray-100 text-gray-500']">
              <UserCircle class="w-6 h-6" />
            </div>
            <span :class="['text-sm font-bold', role === 'student' ? 'text-[#07C160]' : 'text-gray-600']">学员</span>
          </button>
          <button
            @click="role = 'coach'"
            :class="['flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all', role === 'coach' ? 'border-[#FF976A] bg-[#FF976A]/5' : 'border-gray-100 bg-white hover:border-[#FF976A]/30']"
          >
            <div :class="['p-2 rounded-full mb-2', role === 'coach' ? 'bg-[#FF976A] text-white' : 'bg-gray-100 text-gray-500']">
              <Dumbbell class="w-6 h-6" />
            </div>
            <span :class="['text-sm font-bold', role === 'coach' ? 'text-[#FF976A]' : 'text-gray-600']">教练</span>
          </button>
          <button
            @click="role = 'dietitian'"
            :class="['flex flex-col items-center justify-center py-4 rounded-2xl border-2 transition-all', role === 'dietitian' ? 'border-[#1677FF] bg-[#1677FF]/5' : 'border-gray-100 bg-white hover:border-[#1677FF]/30']"
          >
            <div :class="['p-2 rounded-full mb-2', role === 'dietitian' ? 'bg-[#1677FF] text-white' : 'bg-gray-100 text-gray-500']">
              <Leaf class="w-6 h-6" />
            </div>
            <span :class="['text-sm font-bold', role === 'dietitian' ? 'text-[#1677FF]' : 'text-gray-600']">营养师</span>
          </button>
        </div>

        <Button class="w-full" size="lg" @click="handleWeChatLogin">
          <MessageCircle class="h-5 w-5" />
          登录/注册
        </Button>
      </div>

      <p class="text-[10px] text-gray-400 text-center leading-relaxed">
        只有营养师配置了手机号的账户才能登录<br />
        测试账号：18888888888（营养师）
      </p>
    </div>
  </div>

  <div v-else class="flex flex-col bg-white" style="min-height: 100vh; min-height: 100dvh;">
    <NavBar title="绑定手机号" :on-back="() => (step = 1)" />

    <div class="flex-1 flex flex-col px-6 pt-12 pb-6">
      <div class="mb-10">
        <h2 class="text-2xl font-bold text-gray-900 mb-2">安全验证</h2>
        <p class="text-sm text-gray-500">为了保障您的账号安全，请绑定您的常用手机号</p>
      </div>

      <div class="space-y-6">
        <div class="space-y-1 relative">
          <input
            type="tel"
            placeholder="请输入11位手机号"
            class="w-full border-b border-gray-200 py-4 px-2 text-lg focus:border-[#07C160] focus:outline-none transition-colors bg-transparent placeholder-gray-300"
            :value="phone"
            @input="phone = ($event.target as HTMLInputElement).value; error = ''"
            maxlength="11"
          />
        </div>

        <div class="space-y-1 relative flex items-center border-b border-gray-200 focus-within:border-[#07C160] transition-colors">
          <input
            type="number"
            inputmode="numeric"
            placeholder="请输入6位验证码"
            class="flex-1 py-4 px-2 text-lg focus:outline-none bg-transparent placeholder-gray-300"
            :value="code"
            @input="code = ($event.target as HTMLInputElement).value; error = ''"
            maxlength="6"
          />
          <button
            class="text-[#07C160] font-medium text-sm px-4 whitespace-nowrap active:opacity-70 transition-opacity"
            @click="code = '123456'; error = ''"
          >
            获取验证码
          </button>
        </div>
      </div>

      <div v-if="error" class="text-red-500 text-sm mt-4">{{ error }}</div>

      <div class="mt-12">
        <Button class="w-full h-12 text-base font-medium rounded-full shadow-lg shadow-[#07C160]/20" @click="handlePhoneSubmit">
          确认绑定
        </Button>
        <div class="flex justify-center mt-6">
          <VanCheckbox :model-value="agreed" @update:model-value="(v: boolean) => { agreed = v; error = ''; }" class="custom-checkbox">
            <p class="text-[10px] text-gray-400 text-center">
              我已阅读并同意<a href="#" class="text-[#07C160] hover:underline" @click.prevent="showAgreement">《服务协议》</a>与<a href="#" class="text-[#07C160] hover:underline" @click.prevent="showPrivacy">《隐私政策》</a>
            </p>
          </VanCheckbox>
        </div>
      </div>
    </div>
  </div>
</template>
