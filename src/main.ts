import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './index.css';

const app = createApp(App);
app.use(createPinia());

// v-focus 指令：元素挂载时自动聚焦（兼容原生 input/textarea 与 Vant Field 内部 input）
app.directive('focus', {
  mounted: (el: HTMLElement) => {
    const inner = el.querySelector('input, textarea') as HTMLElement | null;
    if (inner) {
      inner.focus();
    } else if (typeof el.focus === 'function') {
      el.focus();
    }
  },
});

app.mount('#root');
