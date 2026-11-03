<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useAppStore } from '../store/app';
import { Button, Input, NavBar, Card } from './ui';
import { RadioGroup as VanRadioGroup, Radio as VanRadio } from 'vant';

const store = useAppStore();
const formData = reactive({
  name: '',
  gender: 'male' as 'male' | 'female',
  age: '',
  height: '',
  medicalHistory: '',
  allergies: '',
});
const error = ref('');

const handleSubmit = () => {
  if (!formData.name || !formData.age || !formData.height) {
    error.value = '请填写所有必填项';
    return;
  }

  store.setUser({
    ...store.user!,
    name: formData.name,
    gender: formData.gender,
    age: Number(formData.age),
    height: Number(formData.height),
    medicalHistory: formData.medicalHistory,
    allergies: formData.allergies,
  });
  store.setCurrentView('questionnaire');
};
</script>

<template>
  <div class="flex min-h-full flex-col bg-[#F7F8FA] pb-8">
    <NavBar title="完善基本信息" />
    <div class="p-4 space-y-4">
      <Card class="space-y-4">
        <div class="space-y-1">
          <label class="text-sm font-medium text-gray-700">姓名 <span class="text-red-500">*</span></label>
          <Input
            placeholder="请输入您的真实姓名"
            :value="formData.name"
            @input="formData.name = ($event.target as HTMLInputElement).value"
          />
        </div>

        <div class="space-y-1">
          <label class="text-sm font-medium text-gray-700">性别 <span class="text-red-500">*</span></label>
          <VanRadioGroup v-model="formData.gender" direction="horizontal" class="custom-radio-group pt-2">
            <VanRadio name="male" class="custom-radio">男</VanRadio>
            <VanRadio name="female" class="custom-radio">女</VanRadio>
          </VanRadioGroup>
        </div>

        <div class="space-y-1">
          <label class="text-sm font-medium text-gray-700">年龄 <span class="text-red-500">*</span></label>
          <Input
            type="number"
            inputmode="numeric"
            placeholder="请输入年龄"
            :value="formData.age"
            @input="formData.age = ($event.target as HTMLInputElement).value"
          />
        </div>

        <div class="space-y-1">
          <label class="text-sm font-medium text-gray-700">身高 (cm) <span class="text-red-500">*</span></label>
          <Input
            type="number"
            inputmode="numeric"
            placeholder="请输入身高"
            :value="formData.height"
            @input="formData.height = ($event.target as HTMLInputElement).value"
          />
        </div>
      </Card>

      <Card class="space-y-4">
        <div class="space-y-1">
          <label class="text-sm font-medium text-gray-700">既往病史 (选填)</label>
          <textarea
            class="w-full rounded-lg border border-gray-100 p-3 text-base focus:outline-none focus:border-[#07C160]"
            rows="3"
            placeholder="如高血压、糖尿病等"
            :value="formData.medicalHistory"
            @input="formData.medicalHistory = ($event.target as HTMLTextAreaElement).value"
          />
        </div>

        <div class="space-y-1">
          <label class="text-sm font-medium text-gray-700">过敏史 (选填)</label>
          <textarea
            class="w-full rounded-lg border border-gray-100 p-3 text-base focus:outline-none focus:border-[#07C160]"
            rows="3"
            placeholder="如海鲜过敏、青霉素过敏等"
            :value="formData.allergies"
            @input="formData.allergies = ($event.target as HTMLTextAreaElement).value"
          />
        </div>
      </Card>

      <p v-if="error" class="text-red-500 text-sm text-center">{{ error }}</p>

      <div class="pt-4">
        <Button class="w-full" size="lg" @click="handleSubmit">
          下一步
        </Button>
      </div>
    </div>
  </div>
</template>
