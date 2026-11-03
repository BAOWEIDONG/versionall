import type { WeightRecord, ExerciseRecord, DietRecord, CoachActivityRecord, RewardTier, RewardClaim, MealTimeConfig, MetricConfig, Camp, Account, PointProduct, PointExchangeRecord, ManualScoreRecord } from '../types';
import type { MetricValue } from '../lib/medicalData';

/** 生成奖品展示图 SVG data URI */
function rewardImg(name: string, emoji: string, c1: string, c2: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="400" height="400" fill="url(#g)" rx="20"/><text x="200" y="180" font-size="130" text-anchor="middle" dominant-baseline="central">${emoji}</text><text x="200" y="320" font-size="34" font-weight="bold" fill="white" text-anchor="middle" font-family="system-ui,sans-serif">${name}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function dateStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function iso(offsetDays: number, time: string): string {
  return `${dateStr(offsetDays)} ${time}`;
}

export const MOCK_STUDENTS: { id: string; name: string; age: number; gender: 'male' | 'female'; phone: string }[] = [
  { id: 's1', name: '李明', age: 32, gender: 'male', phone: '13800000001' },
  { id: 's2', name: '王丽', age: 28, gender: 'female', phone: '13800000002' },
  { id: 's3', name: '张伟', age: 45, gender: 'male', phone: '13800000003' },
  { id: 's4', name: '赵静', age: 26, gender: 'female', phone: '13800000004' },
  { id: 's5', name: '周杰', age: 31, gender: 'male', phone: '13800000005' },
  { id: 's6', name: '吴磊', age: 29, gender: 'male', phone: '13800000006' },
  { id: 's7', name: '郑爽', age: 24, gender: 'female', phone: '13800000007' },
  { id: 's8', name: '王强', age: 35, gender: 'male', phone: '13800000008' },
  { id: 's9', name: '刘梅', age: 33, gender: 'female', phone: '13800000009' },
  { id: 's10', name: '孙悟空', age: 30, gender: 'male', phone: '13800000010' },
  { id: 's11', name: '钱多多', age: 27, gender: 'male', phone: '13800000011' },
  // s12：演示用——每天只完成部分打卡(1-2项)，用于展示「打卡率」与「打卡全部完成率」区别
  { id: 's12', name: '陈曦', age: 30, gender: 'female', phone: '13800000012' },
  // 体验账号：同一手机号可按学员/营养师/教练三种角色登录（登录时选择角色）
  { id: 's13', name: '体验学员', age: 30, gender: 'female', phone: '13900000009' },
];

// 完整打卡天数：今天往前连续 N 天，三餐+运动都完成
const COMPLETE_DAYS = 11;

export const MOCK_DIET_RECORDS: DietRecord[] = [];

export const MOCK_EXERCISE_RECORDS: ExerciseRecord[] = [];

// 生成连续完成打卡数据
for (let i = -(COMPLETE_DAYS - 1); i <= 0; i++) {
  const idSuffix = Math.abs(i).toString().padStart(2, '0');
  MOCK_DIET_RECORDS.push(
    {
      id: `d_b_${idSuffix}`,
      studentId: 's1',
      campId: 'camp1',
      date: iso(i, '08:00:00'),
      meal: 'breakfast',
      description: '燕麦粥一碗，白煮蛋两个，一杯牛奶',
      photos: ['https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=400&q=80'],
      dietitianComment: i < 0 && i % 3 === 0 ? '早餐搭配很不错，继续保持！' : undefined,
      dietitianCommentDate: i < 0 && i % 3 === 0 ? iso(i, '10:00:00') : undefined,
      dietitianName: i < 0 && i % 3 === 0 ? '王营养师' : undefined,
      dietitianScore: i < 0 ? (i === -1 ? 1 : 2) : undefined,
      hasStaple: i < 0 ? true : undefined,
      hasProtein: i < 0 ? true : undefined,
      hasVegetable: i < 0 ? false : undefined,
    },
    {
      id: `d_l_${idSuffix}`,
      studentId: 's1',
      campId: 'camp1',
      date: iso(i, '12:30:00'),
      meal: 'lunch',
      description: '香煎鸡胸肉沙拉，油醋汁',
      photos: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80'],
      dietitianComment: i < 0 && i % 4 === 0 ? '非常标准的减脂餐。' : undefined,
      dietitianCommentDate: i < 0 && i % 4 === 0 ? iso(i, '14:00:00') : undefined,
      dietitianName: i < 0 && i % 4 === 0 ? '王营养师' : undefined,
      dietitianScore: i < 0 ? 2 : undefined,
      hasStaple: i < 0 ? false : undefined,
      hasProtein: i < 0 ? (i === -3 ? false : true) : undefined,
      hasVegetable: i < 0 ? true : undefined,
    },
    {
      id: `d_d_${idSuffix}`,
      studentId: 's1',
      campId: 'camp1',
      date: iso(i, '18:30:00'),
      meal: 'dinner',
      description: '紫薯、牛肉、西兰花',
      photos: ['https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'],
      dietitianComment: i < 0 && i % 5 === 0 ? '晚餐注意控制主食量。' : undefined,
      dietitianCommentDate: i < 0 && i % 5 === 0 ? iso(i, '20:00:00') : undefined,
      dietitianName: i < 0 && i % 5 === 0 ? '王营养师' : undefined,
      dietitianScore: i < 0 ? 2 : undefined,
      hasStaple: i < 0 ? true : undefined,
      hasProtein: i < 0 ? true : undefined,
      hasVegetable: i < 0 ? true : undefined,
    },
  );
  MOCK_EXERCISE_RECORDS.push({
    id: `e_${idSuffix}`,
    studentId: 's1',
    campId: 'camp1',
    date: iso(i, '19:00:00'),
    type: i % 2 === 0 ? '跑步' : '力量训练',
    duration: 35 + (i % 3) * 5,
    intensity: 3 + (i % 2),
    photos: i % 2 === 0 ? ['https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400&q=80'] : undefined,
    coachComment: i < 0 ? (i % 2 === 0 ? '配速不错，继续保持。' : '动作标准，力量稳步提升。') : undefined,
    coachCommentDate: i < 0 ? iso(i, '21:00:00') : undefined,
    coachName: i < 0 ? '李教练' : undefined,
    coachScore: i < 0 ? 2 : undefined,
  });
}

// s1 每日体重记录（与打卡天数一致，确保5项全部完成）
export const MOCK_WEIGHT_RECORDS: WeightRecord[] = [
  // 入营初始记录（在连续打卡周期之外）
  {
    id: 'w0_5',
    date: iso(-15, '07:00:00'),
    weight: 66.8,
    studentId: 's1',
    campId: 'camp1',
    photos: ['https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&q=80'],
    dietitianComment: '入营初始体重，建议每日晨起空腹称重，保持同一时间点记录更准确。',
    dietitianName: '王营养师',
    dietitianCommentDate: iso(-15, '10:30:00'),
  },
  {
    id: 'w0_4',
    date: iso(-12, '07:10:00'),
    weight: 66.3,
    studentId: 's1',
    campId: 'camp1',
    dietitianComment: '下降0.5kg，趋势良好，注意保证每日饮水量2000ml以上。',
    dietitianName: '王营养师',
    dietitianCommentDate: iso(-12, '14:20:00'),
  },
];

// 生成连续打卡期间的每日体重记录
for (let i = -(COMPLETE_DAYS - 1); i <= 0; i++) {
  const idSuffix = Math.abs(i).toString().padStart(2, '0');
  // 体重从 66.0 (day -10) 线性下降到 64.7 (day 0)，每日约 -0.13kg
  const weight = parseFloat((66.0 - (i + COMPLETE_DAYS - 1) * 0.13).toFixed(1));
  let comment: string | undefined;
  let commentDate: string | undefined;
  if (i === -7) {
    comment = '累计下降1.3kg，趋势稳定，建议增加蛋白质摄入防止肌肉流失。';
    commentDate = iso(-7, '11:00:00');
  } else if (i === -4) {
    comment = '体重持续下降，继续保持饮食和运动的配合！';
    commentDate = iso(-4, '10:00:00');
  } else if (i === -1) {
    comment = '今日体重创新低！累计下降2.1kg，脂肪燃烧效率很好，继续保持！';
    commentDate = iso(-1, '09:45:00');
  }
  MOCK_WEIGHT_RECORDS.push({
    id: `w_${idSuffix}`,
    date: iso(i, '07:05:00'),
    weight,
    studentId: 's1',
    campId: 'camp1',
    photos: i === -1 ? [
      'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=400&q=80',
      'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=400&q=80',
    ] : undefined,
    dietitianComment: comment,
    dietitianName: comment ? '王营养师' : undefined,
    dietitianCommentDate: commentDate,
  });
}

// 其他学员今日/昨日数据（用于排行榜、批注等）
MOCK_DIET_RECORDS.push(
  {
    id: 'd6',
    studentId: 's2',
    campId: 'camp1',
    date: iso(0, '07:30:00'),
    meal: 'breakfast',
    description: '全麦面包两片，无糖豆浆一杯，蓝莓一小把',
    photos: ['https://images.unsplash.com/photo-1525648199074-cee30ba79a4a?w=400&q=80'],
  },
  {
    id: 'd7',
    studentId: 's2',
    campId: 'camp1',
    date: iso(0, '12:40:00'),
    meal: 'lunch',
    description: '水煮虾10只，西兰花，藜麦饭半碗',
    photos: ['https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'],
  },
  {
    id: 'd8',
    studentId: 's3',
    campId: 'camp1',
    date: iso(0, '08:15:00'),
    meal: 'breakfast',
    description: '未进食',
    isFasted: true,
    photos: ['https://images.unsplash.com/photo-1517673132405-a56a62b18caf?w=400&q=80'],
  },
  {
    id: 'd9',
    studentId: 's3',
    campId: 'camp1',
    date: iso(0, '12:00:00'),
    meal: 'lunch',
    description: '鸡胸肉沙拉',
    photos: ['https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&q=80'],
    dietitianComment: '鸡胸肉沙拉很棒，注意沙拉酱的热量。',
    dietitianScore: 2,
  },
  {
    id: 'd10',
    studentId: 's3',
    campId: 'camp1',
    date: iso(0, '18:00:00'),
    meal: 'dinner',
    description: '紫薯、牛肉',
    photos: ['https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'],
    dietitianComment: '牛肉补充蛋白质很好。',
    dietitianScore: 2,
  },
);

MOCK_EXERCISE_RECORDS.push(
  {
    id: 'e_s2_1',
    studentId: 's2',
    campId: 'camp1',
    date: iso(0, '17:30:00'),
    type: '跑步',
    duration: 20,
    intensity: 3,
    // 未批注 - 出现在待批注列表
  },
  {
    id: 'e_s3_1',
    studentId: 's3',
    campId: 'camp1',
    date: iso(0, '20:00:00'),
    type: '瑜伽',
    duration: 40,
    intensity: 2,
    coachComment: '核心收紧得很好，拉伸很到位，继续保持！',
    coachName: '李教练',
    coachCommentDate: iso(0, '20:30:00'),
  },
  {
    id: 'e_s1_video',
    studentId: 's1',
    campId: 'camp1',
    date: iso(0, '19:30:00'),
    type: '跑步',
    duration: 45,
    intensity: 4,
    notes: '今天尝试了新的跑步路线，感觉不错！',
    videoUrls: ['http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'],
    // 未批注 - 出现在待批注列表
  },
);

// 为 s2, s3, s4 生成历史打卡数据（用于结营报告统计）
// 注意：循环不含今天(i<0)，今日数据由下方单独 push 的记录提供，避免重复
const PAST_DAYS_S2 = 8; // s2 连续完成 8 天（含今日）
const PAST_DAYS_S3 = 5; // s3 连续完成 5 天（含今日）
const PAST_DAYS_S4 = 10; // s4 连续完成 10 天（含今日）

for (let i = -(PAST_DAYS_S2 - 1); i < 0; i++) {
  const idSuffix = `s2_${Math.abs(i).toString().padStart(2, '0')}`;
  MOCK_DIET_RECORDS.push(
    { id: `d_b_${idSuffix}`, studentId: 's2', campId: 'camp1', date: iso(i, '07:30:00'), meal: 'breakfast', description: '全麦面包+牛奶', photos: [], dietitianScore: 2 },
    { id: `d_l_${idSuffix}`, studentId: 's2', campId: 'camp1', date: iso(i, '12:00:00'), meal: 'lunch', description: '鸡胸肉沙拉+糙米饭', photos: [], dietitianScore: 2 },
    { id: `d_d_${idSuffix}`, studentId: 's2', campId: 'camp1', date: iso(i, '18:00:00'), meal: 'dinner', description: '清蒸鱼+西兰花', photos: [], dietitianScore: 2 },
  );
  MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's2', campId: 'camp1', date: iso(i, '17:30:00'), type: '跑步', duration: 45, intensity: 3, coachScore: i === -1 ? 1 : 2 });
}

for (let i = -(PAST_DAYS_S3 - 1); i < 0; i++) {
  const idSuffix = `s3_${Math.abs(i).toString().padStart(2, '0')}`;
  MOCK_DIET_RECORDS.push(
    { id: `d_b_${idSuffix}`, studentId: 's3', campId: 'camp1', date: iso(i, '08:00:00'), meal: 'breakfast', description: '燕麦粥+鸡蛋', photos: [], dietitianScore: i === -2 ? 1 : 2 },
    { id: `d_l_${idSuffix}`, studentId: 's3', campId: 'camp1', date: iso(i, '12:30:00'), meal: 'lunch', description: '牛肉+紫薯+蔬菜', photos: [], dietitianScore: i === -2 ? 1 : 2 },
    { id: `d_d_${idSuffix}`, studentId: 's3', campId: 'camp1', date: iso(i, '18:30:00'), meal: 'dinner', description: '鸡胸肉+蔬菜汤', photos: [], dietitianScore: i === -2 ? 1 : 2 },
  );
  MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's3', campId: 'camp1', date: iso(i, '19:00:00'), type: '力量训练', duration: 45, intensity: 4, coachScore: 2 });
}

for (let i = -(PAST_DAYS_S4 - 1); i < 0; i++) {
  const idSuffix = `s4_${Math.abs(i).toString().padStart(2, '0')}`;
  MOCK_DIET_RECORDS.push(
    { id: `d_b_${idSuffix}`, studentId: 's4', campId: 'camp1', date: iso(i, '07:20:00'), meal: 'breakfast', description: '杂粮粥+煮蛋', photos: [], dietitianScore: 2 },
    { id: `d_l_${idSuffix}`, studentId: 's4', campId: 'camp1', date: iso(i, '12:00:00'), meal: 'lunch', description: '虾仁+藜麦+蔬菜', photos: [], dietitianScore: 2 },
    { id: `d_d_${idSuffix}`, studentId: 's4', campId: 'camp1', date: iso(i, '18:00:00'), meal: 'dinner', description: '豆腐+蔬菜+少量主食', photos: [], dietitianScore: 2 },
  );
  MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's4', campId: 'camp1', date: iso(i, '18:30:00'), type: i % 2 === 0 ? '瑜伽' : '游泳', duration: i === -1 ? 35 : 40, intensity: 3, coachScore: i === -1 ? 1 : 2 });
}

// s2 今日晚餐（单独 push 的 d6/d7 只有早午餐，补晚餐使今日打卡完整）
MOCK_DIET_RECORDS.push({
  id: 'd_s2_dinner_today',
  studentId: 's2',
  campId: 'camp1',
  date: iso(0, '18:20:00'),
  meal: 'dinner',
  description: '清蒸鲈鱼+凉拌菠菜+小米粥',
  photos: ['https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80'],
  dietitianScore: 2,
});

// s2/s3/s4 体重记录（与打卡天数对齐，确保 isDayComplete 五项齐全）
// s2: 58.0 -> 56.2 (8天，减重约3.1%，达3%里程碑)
for (let i = -(PAST_DAYS_S2 - 1); i <= 0; i++) {
  const idSuffix = `s2_${Math.abs(i).toString().padStart(2, '0')}`;
  const w = parseFloat((58.0 - (i + PAST_DAYS_S2 - 1) * 0.25).toFixed(1));
  MOCK_WEIGHT_RECORDS.push({ id: `w_${idSuffix}`, date: iso(i, '07:10:00'), weight: w, studentId: 's2', campId: 'camp1' });
}
// s3: 75.0 -> 72.7 (5天，减重约3.1%，达3%里程碑)
for (let i = -(PAST_DAYS_S3 - 1); i <= 0; i++) {
  const idSuffix = `s3_${Math.abs(i).toString().padStart(2, '0')}`;
  const w = parseFloat((75.0 - (i + PAST_DAYS_S3 - 1) * 0.57).toFixed(1));
  MOCK_WEIGHT_RECORDS.push({ id: `w_${idSuffix}`, date: iso(i, '07:15:00'), weight: w, studentId: 's3', campId: 'camp1' });
}
// s4: 55.0 -> 53.3 (10天，减重约3.1%，达3%里程碑)
for (let i = -(PAST_DAYS_S4 - 1); i <= 0; i++) {
  const idSuffix = `s4_${Math.abs(i).toString().padStart(2, '0')}`;
  const w = parseFloat((55.0 - (i + PAST_DAYS_S4 - 1) * 0.19).toFixed(1));
  MOCK_WEIGHT_RECORDS.push({ id: `w_${idSuffix}`, date: iso(i, '07:00:00'), weight: w, studentId: 's4', campId: 'camp1' });
}

// s5 (camp1): 连续 7 天打卡，积分中等
const PAST_DAYS_S5 = 7;
for (let i = -(PAST_DAYS_S5 - 1); i <= 0; i++) {
  const idSuffix = `s5_${Math.abs(i).toString().padStart(2, '0')}`;
  MOCK_DIET_RECORDS.push(
    { id: `d_b_${idSuffix}`, studentId: 's5', campId: 'camp1', date: iso(i, '07:45:00'), meal: 'breakfast', description: '玉米+鸡蛋+豆浆', photos: [], dietitianScore: i % 2 === 0 ? 2 : 1 },
    { id: `d_l_${idSuffix}`, studentId: 's5', campId: 'camp1', date: iso(i, '12:15:00'), meal: 'lunch', description: '鸡腿肉+糙米饭+青菜', photos: [], dietitianScore: 2 },
    { id: `d_d_${idSuffix}`, studentId: 's5', campId: 'camp1', date: iso(i, '18:30:00'), meal: 'dinner', description: '豆腐+蔬菜汤', photos: [], dietitianScore: 1 },
  );
  MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's5', campId: 'camp1', date: iso(i, '19:30:00'), type: '骑车', duration: 40, intensity: 3, coachScore: 1 });
  const w = parseFloat((70.0 - (i + PAST_DAYS_S5 - 1) * 0.21).toFixed(1));
  MOCK_WEIGHT_RECORDS.push({ id: `w_${idSuffix}`, date: iso(i, '07:20:00'), weight: w, studentId: 's5', campId: 'camp1' });
}

// s6 (camp1+camp2): 连续 6 天打卡
const PAST_DAYS_S6 = 6;
for (let i = -(PAST_DAYS_S6 - 1); i <= 0; i++) {
  const idSuffix = `s6_${Math.abs(i).toString().padStart(2, '0')}`;
  MOCK_DIET_RECORDS.push(
    { id: `d_b_${idSuffix}`, studentId: 's6', campId: i < -2 ? 'camp1' : 'camp2', date: iso(i, '08:00:00'), meal: 'breakfast', description: '全麦三明治+牛奶', photos: [], dietitianScore: 2 },
    { id: `d_l_${idSuffix}`, studentId: 's6', campId: i < -2 ? 'camp1' : 'camp2', date: iso(i, '12:30:00'), meal: 'lunch', description: '牛肉面+蔬菜沙拉', photos: [], dietitianScore: 1 },
    { id: `d_d_${idSuffix}`, studentId: 's6', campId: i < -2 ? 'camp1' : 'camp2', date: iso(i, '18:00:00'), meal: 'dinner', description: '鸡胸肉+西兰花', photos: [], dietitianScore: 2 },
  );
  MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's6', campId: i < -2 ? 'camp1' : 'camp2', date: iso(i, '20:00:00'), type: '跑步', duration: 45, intensity: 3, coachScore: 2 });
  const w = parseFloat((65.0 - (i + PAST_DAYS_S6 - 1) * 0.16).toFixed(1));
  MOCK_WEIGHT_RECORDS.push({ id: `w_${idSuffix}`, date: iso(i, '07:30:00'), weight: w, studentId: 's6', campId: i < -2 ? 'camp1' : 'camp2' });
}

// s7 (camp2): 连续 3 天打卡（第二期新学员）
const PAST_DAYS_S7 = 3;
for (let i = -(PAST_DAYS_S7 - 1); i <= 0; i++) {
  const idSuffix = `s7_${Math.abs(i).toString().padStart(2, '0')}`;
  MOCK_DIET_RECORDS.push(
    { id: `d_b_${idSuffix}`, studentId: 's7', campId: 'camp2', date: iso(i, '07:30:00'), meal: 'breakfast', description: '燕麦+牛奶+蓝莓', photos: [], dietitianScore: 2 },
    { id: `d_l_${idSuffix}`, studentId: 's7', campId: 'camp2', date: iso(i, '12:00:00'), meal: 'lunch', description: '三文鱼+藜麦+蔬菜', photos: [], dietitianScore: 2 },
    { id: `d_d_${idSuffix}`, studentId: 's7', campId: 'camp2', date: iso(i, '18:00:00'), meal: 'dinner', description: '蔬菜汤+鸡蛋', photos: [], dietitianScore: 1 },
  );
  MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's7', campId: 'camp2', date: iso(i, '18:30:00'), type: '瑜伽', duration: 50, intensity: 2, coachScore: 2 });
  const w = parseFloat((52.0 - (i + PAST_DAYS_S7 - 1) * 0.1).toFixed(1));
  MOCK_WEIGHT_RECORDS.push({ id: `w_${idSuffix}`, date: iso(i, '07:15:00'), weight: w, studentId: 's7', campId: 'camp2' });
}

// s8 (camp2): 连续 2 天打卡
const PAST_DAYS_S8 = 2;
for (let i = -(PAST_DAYS_S8 - 1); i <= 0; i++) {
  const idSuffix = `s8_${Math.abs(i).toString().padStart(2, '0')}`;
  MOCK_DIET_RECORDS.push(
    { id: `d_b_${idSuffix}`, studentId: 's8', campId: 'camp2', date: iso(i, '08:00:00'), meal: 'breakfast', description: '包子+豆浆', photos: [], dietitianScore: 1 },
    { id: `d_l_${idSuffix}`, studentId: 's8', campId: 'camp2', date: iso(i, '12:30:00'), meal: 'lunch', description: '鸡胸肉+米饭+蔬菜', photos: [], dietitianScore: 2 },
    { id: `d_d_${idSuffix}`, studentId: 's8', campId: 'camp2', date: iso(i, '19:00:00'), meal: 'dinner', description: '蔬菜沙拉+鸡蛋', photos: [], dietitianScore: 1 },
  );
  MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's8', campId: 'camp2', date: iso(i, '20:00:00'), type: '游泳', duration: 45, intensity: 3, coachScore: 2 });
  const w = parseFloat((78.0 - (i + PAST_DAYS_S8 - 1) * 0.15).toFixed(1));
  MOCK_WEIGHT_RECORDS.push({ id: `w_${idSuffix}`, date: iso(i, '07:40:00'), weight: w, studentId: 's8', campId: 'camp2' });
}

// s12 (camp2)：演示用——每天只完成部分打卡。偶数天补全 5 项(算「打卡全部完成」)，奇数天仅 早餐+运动 2 项(算「打卡」但不算全部完成)
// 目的：让学员结营概况里「打卡率(任意打卡)」与「打卡全部完成率(每天完成所有项目)」出现可见差异
const S12_START = -2; // 第二期开营日
const S12_RANGE_END = 0; // 只生成到昨天/今天，禁止未来日期与开营前记录
for (let i = S12_START; i <= S12_RANGE_END; i++) {
  const idSuffix = `s12_${(i >= 0 ? 'p' : 'n') + Math.abs(i).toString().padStart(2, '0')}`;
  const complete = Math.abs(i) % 2 === 0; // 偶数天全完成
  if (complete) {
    MOCK_DIET_RECORDS.push(
      { id: `d_b_${idSuffix}`, studentId: 's12', campId: 'camp2', date: iso(i, '07:20:00'), meal: 'breakfast', description: '燕麦+鸡蛋+牛奶', photos: [], dietitianScore: 2 },
      { id: `d_l_${idSuffix}`, studentId: 's12', campId: 'camp2', date: iso(i, '12:00:00'), meal: 'lunch', description: '鸡胸肉+糙米饭+蔬菜', photos: [], dietitianScore: 2 },
      { id: `d_d_${idSuffix}`, studentId: 's12', campId: 'camp2', date: iso(i, '18:20:00'), meal: 'dinner', description: '清蒸鱼+西兰花', photos: [], dietitianScore: 2 },
    );
    MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's12', campId: 'camp2', date: iso(i, '19:30:00'), type: '瑜伽', duration: 40, intensity: 3, coachScore: 2 });
    const w = parseFloat((63.0 - (i - S12_START) * 0.15).toFixed(1)); // 随时间递减模拟减重
    MOCK_WEIGHT_RECORDS.push({ id: `w_${idSuffix}`, date: iso(i, '07:10:00'), weight: w, studentId: 's12', campId: 'camp2' });
  } else {
    // 部分打卡：只打 早餐 + 运动 两项（计入打卡，但不算全部完成）
    MOCK_DIET_RECORDS.push(
      { id: `d_b_${idSuffix}`, studentId: 's12', campId: 'camp2', date: iso(i, '07:20:00'), meal: 'breakfast', description: '燕麦+鸡蛋+牛奶', photos: [], dietitianScore: 2 },
    );
    MOCK_EXERCISE_RECORDS.push({ id: `e_${idSuffix}`, studentId: 's12', campId: 'camp2', date: iso(i, '19:30:00'), type: '瑜伽', duration: 40, intensity: 3, coachScore: 2 });
  }
}

export const MOCK_COACH_ACTIVITIES: CoachActivityRecord[] = [
  {
    id: 'a1',
    title: '全身燃脂 HIIT',
    description: '每天坚持15分钟，帮你快速燃烧卡路里！第一步：高抬腿；第二步：开合跳；第三步：波比跳。',
    imageUrls: [
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=800&q=80',
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80',
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80'
    ],
    coachName: '李教练',
    date: dateStr(0),
    videoUrls: ['http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'],
  },
  {
    id: 'a2',
    title: '晨间瑜伽唤醒',
    description: '通过几个简单的体式，唤醒僵硬的身体，开始元气满满的一天。',
    imageUrls: [
      'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&q=80',
      'https://images.unsplash.com/photo-1599901860904-17e08c2d159a?w=800&q=80'
    ],
    coachName: '王教练',
    date: dateStr(-1),
    campIds: ['camp1'],
  },
  {
    id: 'a3',
    title: '核心力量强化',
    description: '不要只关注马甲线，核心肌群的强化对任何运动都至关重要。',
    imageUrls: [
      'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=80',
      'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=800&q=80',
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800&q=80'
    ],
    coachName: '张教练',
    date: dateStr(-2),
  }
];

// Mock reward data
export const MOCK_REWARD_TIERS: RewardTier[] = [
  {
    id: 't0',
    campId: 'camp1',
    name: '运动跳绳',
    requiredDays: 5,
    imageUrl: rewardImg('运动跳绳', '🏃', '#4A90D9', '#357ABD'),
    stock: 100,
    source: 'streak',
    description: '专业计数跳绳，防滑手柄，轴承顺滑，每日燃脂好搭档',
    deliveryMethods: ['shipped', 'in-person'],
  },
  {
    id: 't1',
    campId: 'camp1',
    name: '运动水杯',
    requiredDays: 10,
    imageUrl: rewardImg('运动水杯', '🥤', '#07C160', '#06A952'),
    stock: 50,
    source: 'streak',
    description: '便携运动水杯 500ml，BPA-free 材质，健康饮水好搭档',
    deliveryMethods: ['shipped', 'in-person'],
  },
  {
    id: 't2',
    campId: 'camp1',
    name: '瑜伽垫',
    requiredDays: 21,
    imageUrl: rewardImg('瑜伽垫', '🧘', '#8B5CF6', '#7C3AED'),
    stock: 20,
    source: 'streak',
    description: '加厚防滑瑜伽垫 6mm，TPE 环保材质，健身塑形更舒适',
    deliveryMethods: ['shipped', 'in-person'],
  },
  {
    id: 't3',
    campId: 'camp1',
    name: '智能体脂秤',
    requiredDays: 28,
    imageUrl: rewardImg('智能体脂秤', '⚖️', '#374151', '#1F2937'),
    stock: 5,
    source: 'streak',
    description: '智能体脂秤，连接手机同步记录，28 项身体数据科学管理',
    deliveryMethods: ['shipped'],
  },
];

export const MOCK_REWARD_CLAIMS: RewardClaim[] = [
  {
    id: 'c1',
    campId: 'camp1',
    tierId: 't0',
    studentId: 's1',
    studentName: '李明',
    recipientName: '李明',
    recipientPhone: '13800000001',
    recipientAddress: '北京市朝阳区某某路1号',
    claimDate: iso(-6, '10:00:00'),
    status: 'shipped',
    trackingNumber: 'SF1029384756',
    shipDate: iso(-5, '09:00:00'),
    deliveryMethod: 'shipped',
  },
  {
    id: 'c2',
    campId: 'camp1',
    tierId: 't0',
    studentId: 's2',
    studentName: '王丽',
    recipientName: '王丽',
    recipientPhone: '13800000002',
    recipientAddress: '上海市浦东新区某某路2号',
    claimDate: iso(0, '11:00:00'),
    status: 'pending',
    deliveryMethod: 'shipped',
  },
];

// Default meal time config - 默认全部关闭，学员可随时打卡
export const DEFAULT_MEAL_TIME_CONFIG: MealTimeConfig = {
  breakfast: { start: '06:00', end: '10:00', enabled: false },
  lunch: { start: '11:00', end: '14:00', enabled: false },
  dinner: { start: '17:00', end: '21:00', enabled: false },
  snack: { start: '14:00', end: '17:00', enabled: false },
};

// Default health metric configs (clinical indicators with gender-specific ranges)
export const DEFAULT_METRIC_CONFIGS: MetricConfig[] = [
  // 身体测量数据
  { id: 'mc_body_weight', name: '体重', unit: 'kg', normalRange: '参考值视身高而定', category: '身体测量数据' },
  { id: 'mc_body_muscle', name: '肌肉量', unit: 'kg', normalRange: '40.0 - 55.0', category: '身体测量数据' },
  { id: 'mc_body_skeletal', name: '骨骼肌', unit: 'kg', normalRange: '25.0 - 35.0', category: '身体测量数据' },
  { id: 'mc_body_fat', name: '脂肪量', unit: 'kg', normalRange: '10.0 - 20.0', category: '身体测量数据' },
  { id: 'mc_body_bmr', name: '基础代谢率', unit: 'kcal', normalRange: '1300 - 1700', category: '身体测量数据' },
  { id: 'mc_body_whr', name: '腰臀比', unit: '', normalRange: '0.70 - 0.90', category: '身体测量数据' },
  { id: 'mc_body_visceral', name: '内脏脂肪面积', unit: 'cm²', normalRange: '50 - 100', category: '身体测量数据' },
  { id: 'mc_body_obesity', name: '肥胖度', unit: '%', normalRange: '90 - 110', category: '身体测量数据' },
  { id: 'mc_body_cell', name: '身体细胞量', unit: 'kg', normalRange: '30.0 - 45.0', category: '身体测量数据' },
  { id: 'mc_body_edema', name: '浮肿指数', unit: '', normalRange: '0.36 - 0.39', category: '身体测量数据' },
  { id: 'mc_body_asmi', name: '四肢骨骼肌质量指数', unit: 'kg/㎡', normalRange: '6.0 - 9.0', category: '身体测量数据' },
  { id: 'mc_body_ainst', name: 'AINST评分', unit: '分', normalRange: '70 - 100', category: '身体测量数据' },
  // 肝功能相关
  { id: 'mc_liver_alt', name: '丙氨酸氨基转移酶', unit: 'U/L', normalRange: '9-50', category: '肝功能相关' },
  { id: 'mc_liver_ast', name: '天门冬氨酸氨基转移酶', unit: 'U/L', normalRange: '15-40', category: '肝功能相关' },
  { id: 'mc_liver_tp', name: '总蛋白', unit: 'g/L', normalRange: '65-85', category: '肝功能相关' },
  { id: 'mc_liver_alb', name: '白蛋白', unit: 'g/L', normalRange: '40-55', category: '肝功能相关' },
  { id: 'mc_liver_palb', name: '前白蛋白', unit: 'mg/L', normalRange: '200-430', category: '肝功能相关' },
  { id: 'mc_liver_tbil', name: '总胆红素', unit: 'μmol/L', normalRange: '0-23', category: '肝功能相关' },
  { id: 'mc_liver_dbil', name: '直接胆红素', unit: 'μmol/L', normalRange: '0-6.84', category: '肝功能相关' },
  { id: 'mc_liver_alp', name: '碱性磷酸酶', unit: 'U/L', normalRange: '45-125', category: '肝功能相关' },
  { id: 'mc_liver_ggt', name: 'γ-谷氨酰基转移酶', unit: 'U/L', normalRange: '男10-60 / 女7-45', category: '肝功能相关' },
  // 肾功能相关
  { id: 'mc_kidney_urea', name: '尿素氮', unit: 'mmol/L', normalRange: '3.1-8', category: '肾功能相关' },
  { id: 'mc_kidney_cr', name: '肌酐', unit: 'μmol/L', normalRange: '57-97', category: '肾功能相关' },
  { id: 'mc_kidney_ua', name: '尿酸', unit: 'μmol/L', normalRange: '208-428', category: '肾功能相关' },
  // 血脂相关
  { id: 'mc_bl_tc', name: '总胆固醇', unit: 'mmol/L', normalRange: '<5.18', category: '血脂相关' },
  { id: 'mc_bl_tg', name: '甘油三酯', unit: 'mmol/L', normalRange: '<1.7', category: '血脂相关' },
  { id: 'mc_bl_hdl', name: '高密度脂蛋白胆固醇', unit: 'mmol/L', normalRange: '1.04-1.55', category: '血脂相关' },
  { id: 'mc_bl_ldl', name: '低密度脂蛋白胆固醇', unit: 'mmol/L', normalRange: '<3.33', category: '血脂相关' },
  // 血糖相关
  { id: 'mc_bs_fasting', name: '葡萄糖(空腹)', unit: 'mmol/L', normalRange: '3.89-6.11', category: '血糖相关' },
  { id: 'mc_bs_hba1c', name: '糖化血红蛋白', unit: '%', normalRange: '4.0-6.0', category: '血糖相关' },
];

// Mock metric values keyed by metric config id (beforeValue/afterValue only;
// isBeforeOut/isAfterOut are computed dynamically by isValueOutOfRange)
// This is the default set (student s1), with afterValues showing improvement
export const MOCK_METRIC_VALUES: Record<string, MetricValue> = {
  'mc_body_weight': { beforeValue: 80.5, afterValue: 75.2 },
  'mc_body_muscle': { beforeValue: 45.2, afterValue: 46.5 },
  'mc_body_skeletal': { beforeValue: 28.1, afterValue: 28.8 },
  'mc_body_fat': { beforeValue: 28.5, afterValue: 23.8 },
  'mc_body_bmr': { beforeValue: 1450, afterValue: 1480 },
  'mc_body_whr': { beforeValue: 0.95, afterValue: 0.88 },
  'mc_body_visceral': { beforeValue: 120, afterValue: 95 },
  'mc_body_obesity': { beforeValue: 125, afterValue: 108 },
  'mc_body_cell': { beforeValue: 35.5, afterValue: 36.2 },
  'mc_body_edema': { beforeValue: 0.40, afterValue: 0.38 },
  'mc_body_asmi': { beforeValue: 7.5, afterValue: 7.8 },
  'mc_body_ainst': { beforeValue: 65, afterValue: 78 },
  'mc_liver_alt': { beforeValue: 55, afterValue: 38 },
  'mc_liver_ast': { beforeValue: 35, afterValue: 28 },
  'mc_liver_tp': { beforeValue: 72, afterValue: 74 },
  'mc_liver_alb': { beforeValue: 45, afterValue: 47 },
  'mc_liver_palb': { beforeValue: 250, afterValue: 280 },
  'mc_liver_tbil': { beforeValue: 15.2, afterValue: 14.0 },
  'mc_liver_dbil': { beforeValue: 4.1, afterValue: 3.5 },
  'mc_liver_alp': { beforeValue: 95, afterValue: 88 },
  'mc_liver_ggt': { beforeValue: 65, afterValue: 42 },
  'mc_kidney_urea': { beforeValue: 5.4, afterValue: 5.0 },
  'mc_kidney_cr': { beforeValue: 88, afterValue: 85 },
  'mc_kidney_ua': { beforeValue: 450, afterValue: 380 },
  'mc_bl_tc': { beforeValue: 5.5, afterValue: 4.8 },
  'mc_bl_tg': { beforeValue: 2.1, afterValue: 1.5 },
  'mc_bl_hdl': { beforeValue: 1.1, afterValue: 1.3 },
  'mc_bl_ldl': { beforeValue: 3.5, afterValue: 2.9 },
  'mc_bs_fasting': { beforeValue: 5.8, afterValue: 5.2 },
  'mc_bs_hba1c': { beforeValue: 6.2, afterValue: 5.8 },
};

/**
 * 每位学员的指标值（用于结营报告）
 * key = studentId, value = { [configId]: MetricValue }
 * s1 使用 MOCK_METRIC_VALUES 的数据（已有 afterValue）
 * 其他学员有各自的 before/after 数据
 */
export const MOCK_STUDENT_METRIC_VALUES: Record<string, Record<string, MetricValue>> = {
  's1': MOCK_METRIC_VALUES,
  's2': {
    'mc_body_weight': { beforeValue: 62.0, afterValue: 58.5 },
    'mc_body_muscle': { beforeValue: 38.0, afterValue: 39.5 },
    'mc_body_skeletal': { beforeValue: 23.5, afterValue: 24.2 },
    'mc_body_fat': { beforeValue: 22.0, afterValue: 18.5 },
    'mc_body_bmr': { beforeValue: 1300, afterValue: 1330 },
    'mc_body_whr': { beforeValue: 0.85, afterValue: 0.80 },
    'mc_body_visceral': { beforeValue: 85, afterValue: 70 },
    'mc_body_obesity': { beforeValue: 105, afterValue: 98 },
    'mc_body_cell': { beforeValue: 30.0, afterValue: 30.8 },
    'mc_body_edema': { beforeValue: 0.38, afterValue: 0.37 },
    'mc_body_asmi': { beforeValue: 6.2, afterValue: 6.5 },
    'mc_body_ainst': { beforeValue: 72, afterValue: 82 },
    'mc_liver_alt': { beforeValue: 28, afterValue: 22 },
    'mc_liver_ast': { beforeValue: 22, afterValue: 20 },
    'mc_liver_tp': { beforeValue: 68, afterValue: 70 },
    'mc_liver_alb': { beforeValue: 42, afterValue: 44 },
    'mc_liver_palb': { beforeValue: 220, afterValue: 250 },
    'mc_liver_tbil': { beforeValue: 12.0, afterValue: 11.0 },
    'mc_liver_dbil': { beforeValue: 3.0, afterValue: 2.5 },
    'mc_liver_alp': { beforeValue: 78, afterValue: 75 },
    'mc_liver_ggt': { beforeValue: 32, afterValue: 25 },
    'mc_kidney_urea': { beforeValue: 4.5, afterValue: 4.2 },
    'mc_kidney_cr': { beforeValue: 62, afterValue: 60 },
    'mc_kidney_ua': { beforeValue: 320, afterValue: 280 },
    'mc_bl_tc': { beforeValue: 4.8, afterValue: 4.2 },
    'mc_bl_tg': { beforeValue: 1.3, afterValue: 1.0 },
    'mc_bl_hdl': { beforeValue: 1.2, afterValue: 1.4 },
    'mc_bl_ldl': { beforeValue: 2.8, afterValue: 2.3 },
    'mc_bs_fasting': { beforeValue: 5.2, afterValue: 4.8 },
    'mc_bs_hba1c': { beforeValue: 5.6, afterValue: 5.3 },
  },
  's3': {
    'mc_body_weight': { beforeValue: 95.0, afterValue: 88.0 },
    'mc_body_muscle': { beforeValue: 48.0, afterValue: 49.5 },
    'mc_body_skeletal': { beforeValue: 30.0, afterValue: 30.8 },
    'mc_body_fat': { beforeValue: 35.0, afterValue: 28.0 },
    'mc_body_bmr': { beforeValue: 1550, afterValue: 1580 },
    'mc_body_whr': { beforeValue: 1.0, afterValue: 0.92 },
    'mc_body_visceral': { beforeValue: 140, afterValue: 105 },
    'mc_body_obesity': { beforeValue: 135, afterValue: 118 },
    'mc_body_cell': { beforeValue: 38.0, afterValue: 39.0 },
    'mc_body_edema': { beforeValue: 0.39, afterValue: 0.38 },
    'mc_body_asmi': { beforeValue: 8.0, afterValue: 8.2 },
    'mc_body_ainst': { beforeValue: 58, afterValue: 72 },
    'mc_liver_alt': { beforeValue: 72, afterValue: 45 },
    'mc_liver_ast': { beforeValue: 48, afterValue: 35 },
    'mc_liver_tp': { beforeValue: 70, afterValue: 73 },
    'mc_liver_alb': { beforeValue: 43, afterValue: 46 },
    'mc_liver_palb': { beforeValue: 230, afterValue: 260 },
    'mc_liver_tbil': { beforeValue: 18.0, afterValue: 15.0 },
    'mc_liver_dbil': { beforeValue: 5.0, afterValue: 4.0 },
    'mc_liver_alp': { beforeValue: 105, afterValue: 95 },
    'mc_liver_ggt': { beforeValue: 80, afterValue: 50 },
    'mc_kidney_urea': { beforeValue: 6.0, afterValue: 5.2 },
    'mc_kidney_cr': { beforeValue: 95, afterValue: 90 },
    'mc_kidney_ua': { beforeValue: 480, afterValue: 400 },
    'mc_bl_tc': { beforeValue: 6.2, afterValue: 5.0 },
    'mc_bl_tg': { beforeValue: 2.8, afterValue: 1.6 },
    'mc_bl_hdl': { beforeValue: 0.9, afterValue: 1.1 },
    'mc_bl_ldl': { beforeValue: 4.0, afterValue: 3.0 },
    'mc_bs_fasting': { beforeValue: 6.5, afterValue: 5.6 },
    'mc_bs_hba1c': { beforeValue: 6.5, afterValue: 5.9 },
  },
  's4': {
    'mc_body_weight': { beforeValue: 58.0, afterValue: 55.5 },
    'mc_body_muscle': { beforeValue: 36.0, afterValue: 37.2 },
    'mc_body_skeletal': { beforeValue: 22.0, afterValue: 22.8 },
    'mc_body_fat': { beforeValue: 19.0, afterValue: 16.0 },
    'mc_body_bmr': { beforeValue: 1250, afterValue: 1280 },
    'mc_body_whr': { beforeValue: 0.82, afterValue: 0.78 },
    'mc_body_visceral': { beforeValue: 75, afterValue: 60 },
    'mc_body_obesity': { beforeValue: 102, afterValue: 96 },
    'mc_body_cell': { beforeValue: 28.0, afterValue: 29.0 },
    'mc_body_edema': { beforeValue: 0.37, afterValue: 0.37 },
    'mc_body_asmi': { beforeValue: 5.8, afterValue: 6.1 },
    'mc_body_ainst': { beforeValue: 75, afterValue: 84 },
    'mc_liver_alt': { beforeValue: 18, afterValue: 16 },
    'mc_liver_ast': { beforeValue: 20, afterValue: 18 },
    'mc_liver_tp': { beforeValue: 70, afterValue: 72 },
    'mc_liver_alb': { beforeValue: 44, afterValue: 45 },
    'mc_liver_palb': { beforeValue: 240, afterValue: 260 },
    'mc_liver_tbil': { beforeValue: 10.5, afterValue: 10.0 },
    'mc_liver_dbil': { beforeValue: 2.8, afterValue: 2.5 },
    'mc_liver_alp': { beforeValue: 72, afterValue: 70 },
    'mc_liver_ggt': { beforeValue: 25, afterValue: 22 },
    'mc_kidney_urea': { beforeValue: 4.0, afterValue: 3.8 },
    'mc_kidney_cr': { beforeValue: 58, afterValue: 56 },
    'mc_kidney_ua': { beforeValue: 280, afterValue: 250 },
    'mc_bl_tc': { beforeValue: 4.5, afterValue: 4.0 },
    'mc_bl_tg': { beforeValue: 1.1, afterValue: 0.9 },
    'mc_bl_hdl': { beforeValue: 1.3, afterValue: 1.5 },
    'mc_bl_ldl': { beforeValue: 2.5, afterValue: 2.1 },
    'mc_bs_fasting': { beforeValue: 5.0, afterValue: 4.7 },
    'mc_bs_hba1c': { beforeValue: 5.4, afterValue: 5.2 },
  },
  // s5: 部分指标改善、部分不变或恶化（使企业汇报版改善率不再全是 100%）
  's5': {
    'mc_body_weight': { beforeValue: 70.0, afterValue: 68.5 },
    'mc_body_muscle': { beforeValue: 42.0, afterValue: 41.5 },   // 肌肉略减（未改善）
    'mc_body_skeletal': { beforeValue: 26.0, afterValue: 26.2 },
    'mc_body_fat': { beforeValue: 24.0, afterValue: 22.0 },
    'mc_body_bmr': { beforeValue: 1380, afterValue: 1370 },      // 代谢略降（未改善）
    'mc_body_whr': { beforeValue: 0.88, afterValue: 0.85 },
    'mc_body_visceral': { beforeValue: 95, afterValue: 88 },
    'mc_body_obesity': { beforeValue: 108, afterValue: 104 },
    'mc_liver_alt': { beforeValue: 32, afterValue: 28 },
    'mc_liver_ast': { beforeValue: 25, afterValue: 23 },
    'mc_liver_ggt': { beforeValue: 38, afterValue: 42 },          // GGT 升高（未改善）
    'mc_kidney_ua': { beforeValue: 360, afterValue: 380 },        // 尿酸升高（未改善）
    'mc_bl_tc': { beforeValue: 4.8, afterValue: 4.6 },
    'mc_bl_tg': { beforeValue: 1.4, afterValue: 1.2 },
    'mc_bl_hdl': { beforeValue: 1.1, afterValue: 1.2 },
    'mc_bl_ldl': { beforeValue: 2.8, afterValue: 2.6 },
    'mc_bs_fasting': { beforeValue: 5.4, afterValue: 5.3 },
    'mc_bs_hba1c': { beforeValue: 5.6, afterValue: 5.5 },
  },
  // s6: 改善较少的学员（多项指标几乎不变）
  's6': {
    'mc_body_weight': { beforeValue: 65.0, afterValue: 64.5 },
    'mc_body_muscle': { beforeValue: 40.0, afterValue: 40.0 },    // 不变
    'mc_body_fat': { beforeValue: 20.0, afterValue: 19.5 },
    'mc_body_bmr': { beforeValue: 1350, afterValue: 1350 },       // 不变
    'mc_body_visceral': { beforeValue: 80, afterValue: 78 },
    'mc_liver_alt': { beforeValue: 22, afterValue: 24 },          // 略升（未改善）
    'mc_liver_ggt': { beforeValue: 28, afterValue: 30 },          // 略升（未改善）
    'mc_kidney_ua': { beforeValue: 310, afterValue: 305 },
    'mc_bl_tc': { beforeValue: 4.5, afterValue: 4.4 },
    'mc_bl_tg': { beforeValue: 1.2, afterValue: 1.3 },            // 略升（未改善）
    'mc_bl_hdl': { beforeValue: 1.2, afterValue: 1.2 },           // 不变
    'mc_bl_ldl': { beforeValue: 2.6, afterValue: 2.5 },
    'mc_bs_fasting': { beforeValue: 5.1, afterValue: 5.0 },
    'mc_bs_hba1c': { beforeValue: 5.3, afterValue: 5.3 },         // 不变
  },
};

// Per-student weight records (for camp report weight trend)
export const MOCK_STUDENT_WEIGHTS: Record<string, WeightRecord[]> = {
  's2': [
    { id: 'w_s2_1', date: iso(-15, '07:00:00'), weight: 62.0, studentId: 's2', campId: 'camp1' },
    { id: 'w_s2_2', date: iso(-10, '07:10:00'), weight: 61.0, studentId: 's2', campId: 'camp1' },
    { id: 'w_s2_3', date: iso(-5, '07:00:00'), weight: 59.8, studentId: 's2', campId: 'camp1' },
    { id: 'w_s2_4', date: iso(-1, '07:05:00'), weight: 58.5, studentId: 's2', campId: 'camp1' },
  ],
  's3': [
    { id: 'w_s3_1', date: iso(-15, '07:00:00'), weight: 95.0, studentId: 's3', campId: 'camp1' },
    { id: 'w_s3_2', date: iso(-10, '07:10:00'), weight: 92.5, studentId: 's3', campId: 'camp1' },
    { id: 'w_s3_3', date: iso(-5, '07:00:00'), weight: 89.8, studentId: 's3', campId: 'camp1' },
    { id: 'w_s3_4', date: iso(-1, '07:05:00'), weight: 88.0, studentId: 's3', campId: 'camp1' },
  ],
  's4': [
    { id: 'w_s4_1', date: iso(-15, '07:00:00'), weight: 58.0, studentId: 's4', campId: 'camp1' },
    { id: 'w_s4_2', date: iso(-10, '07:10:00'), weight: 57.0, studentId: 's4', campId: 'camp1' },
    { id: 'w_s4_3', date: iso(-5, '07:00:00'), weight: 56.0, studentId: 's4', campId: 'camp1' },
    { id: 'w_s4_4', date: iso(-1, '07:05:00'), weight: 55.5, studentId: 's4', campId: 'camp1' },
  ],
};

// 将所有学员的体重记录合并到 MOCK_WEIGHT_RECORDS，确保 store.weightRecords 包含全部学员数据
// 前后端联调时，后端 GET /weight-records 应返回全部学员的体重记录（含 studentId 字段）
Object.values(MOCK_STUDENT_WEIGHTS).forEach((records) => {
  records.forEach((r) => {
    if (!MOCK_WEIGHT_RECORDS.some((m) => m.id === r.id)) {
      MOCK_WEIGHT_RECORDS.push(r);
    }
  });
});

// ============================================================================
//  账户管理 Mock 数据
// ============================================================================

/** 营期/期列表 */
export const MOCK_CAMPS: Camp[] = [
  { id: 'camp1', name: '第一期', startDate: dateStr(-15), endDate: dateStr(13), status: 'active' },
  { id: 'camp2', name: '第二期', startDate: dateStr(-2), endDate: dateStr(26), status: 'active' },
  { id: 'camp3', name: '第三期', startDate: dateStr(7), endDate: dateStr(35), status: 'upcoming' },
];

/** 账户列表（手机号 = 登录凭证） */
export const MOCK_ACCOUNTS: Account[] = [
  // 营养师（第一批数据库预维护，后续可在营养师端管理）
  { id: 'd0', phone: '18888888888', name: '管理员', role: 'dietitian', active: true, createdAt: iso(-30, '09:00:00') },
  { id: 'd1', phone: '13900000001', name: '王营养师', role: 'dietitian', active: true, createdAt: iso(-30, '09:00:00') },
  { id: 'd2', phone: '13900000002', name: '李营养师', role: 'dietitian', active: true, createdAt: iso(-20, '09:00:00') },
  // 体验营养师 / 运营督导：同号不同角色，带督导权限可见运营总览
  { id: 'sup1', phone: '13900000009', name: '运营督导', role: 'dietitian', campIds: ['camp1', 'camp2'], active: true, supervisor: true, createdAt: iso(-30, '09:00:00') },
  // 教练
  { id: 'c1', phone: '13700000001', name: '李教练', role: 'coach', campIds: ['camp1'], active: true, createdAt: iso(-28, '10:00:00') },
  { id: 'c2', phone: '13700000002', name: '王教练', role: 'coach', campIds: ['camp1', 'camp2'], active: true, createdAt: iso(-28, '10:00:00') },
  { id: 'c3', phone: '13700000003', name: '张教练', role: 'coach', active: true, createdAt: iso(-28, '10:00:00') },
  // 体验教练：同号不同角色
  { id: 'c4', phone: '13900000009', name: '体验教练', role: 'coach', campIds: ['camp1', 'camp2'], active: true, createdAt: iso(-28, '10:00:00') },
  // 学员（id 与 MOCK_STUDENTS 一致，确保登录后能关联到打卡/体重/检测数据）
  { id: 's1', phone: '13800000001', name: '李明', role: 'student', campIds: ['camp1'], active: true, createdAt: iso(-15, '08:00:00') },
  { id: 's2', phone: '13800000002', name: '王丽', role: 'student', campIds: ['camp1'], active: true, createdAt: iso(-15, '08:00:00') },
  { id: 's3', phone: '13800000003', name: '张伟', role: 'student', campIds: ['camp1'], active: true, createdAt: iso(-15, '08:00:00') },
  { id: 's4', phone: '13800000004', name: '赵静', role: 'student', campIds: ['camp1'], active: true, createdAt: iso(-15, '08:00:00') },
  { id: 's5', phone: '13800000005', name: '周杰', role: 'student', campIds: ['camp1'], active: true, createdAt: iso(-15, '08:00:00') },
  { id: 's6', phone: '13800000006', name: '吴磊', role: 'student', campIds: ['camp1', 'camp2'], active: true, createdAt: iso(-15, '08:00:00') },
  { id: 's7', phone: '13800000007', name: '郑爽', role: 'student', campIds: ['camp2'], active: true, createdAt: iso(-2, '08:00:00') },
  { id: 's8', phone: '13800000008', name: '王强', role: 'student', campIds: ['camp2'], active: true, createdAt: iso(-2, '08:00:00') },
  { id: 's9', phone: '13800000009', name: '刘梅', role: 'student', campIds: ['camp2'], active: false, createdAt: iso(-2, '08:00:00') },
  { id: 's10', phone: '13800000010', name: '孙悟空', role: 'student', campIds: ['camp1', 'camp2'], active: true, createdAt: iso(-15, '08:00:00') },
  // 仅属于未开营营期（camp3）的学员，用于演示"营期未开始禁止打卡"
  { id: 's11', phone: '13800000011', name: '钱多多', role: 'student', campIds: ['camp3'], active: true, createdAt: iso(7, '08:00:00') },
  // 体验学员：同号不同角色
  { id: 's13', phone: '13900000009', name: '体验学员', role: 'student', campIds: ['camp1', 'camp2'], active: true, createdAt: iso(-15, '08:00:00') },
  // s12 演示用：仅部分打卡，展示打卡率与打卡全部完成率区别
  { id: 's12', phone: '13800000012', name: '陈曦', role: 'student', campIds: ['camp2'], active: true, createdAt: iso(-10, '08:00:00') },
];

/** 积分商城商品 */
export const MOCK_POINT_PRODUCTS: PointProduct[] = [
  // 按营期分流：camp1 = 水杯/瑜伽垫/筋膜枪；camp2 = 跳绳/体脂秤/蛋白粉（camp3 新营期默认空，营养师可自行新增）
  { id: 'pp1', name: '运动水杯', imageUrl: rewardImg('运动水杯', '🥤', '#1677FF', '#0099CC'), description: '便携运动水杯 500ml，BPA-free 材质，健康饮水好搭档', pointsRequired: 30, stock: 50, active: true, deliveryOptions: ['shipped', 'in-person'], maxExchange: 2, campId: 'camp1' },
  { id: 'pp2', name: '跳绳', imageUrl: rewardImg('跳绳', '🤸', '#FF976A', '#FF6B35'), description: '专业计数跳绳，防滑手柄，轴承顺滑，燃脂利器', pointsRequired: 50, stock: 29, active: true, deliveryOptions: ['shipped', 'in-person'], campId: 'camp2' },
  { id: 'pp3', name: '瑜伽垫', imageUrl: rewardImg('瑜伽垫', '🧘', '#07C160', '#04A551'), description: '加厚防滑瑜伽垫 6mm，TPE 环保材质，运动更舒适', pointsRequired: 80, stock: 20, active: true, deliveryOptions: ['shipped'], campId: 'camp1' },
  { id: 'pp4', name: '电子体脂秤', imageUrl: rewardImg('体脂秤', '⚖️', '#8B5CF6', '#6D28D9'), description: '智能体脂秤，13项身体数据监测，蓝牙连接APP', pointsRequired: 120, stock: 10, active: true, deliveryOptions: ['shipped'], campId: 'camp2' },
  { id: 'pp5', name: '蛋白粉', imageUrl: rewardImg('蛋白粉', '💪', '#F59E0B', '#D97706'), description: '乳清蛋白粉 500g，运动后补充蛋白质，助力恢复', pointsRequired: 100, stock: 15, active: true, deliveryOptions: ['shipped', 'in-person'], campId: 'camp2' },
  { id: 'pp6', name: '筋膜枪', imageUrl: rewardImg('筋膜枪', '🔫', '#EC4899', '#DB2777'), description: '迷你筋膜枪，4档力度调节，运动后放松肌肉', pointsRequired: 200, stock: 5, active: true, deliveryOptions: ['shipped'], maxExchange: 1, campId: 'camp1' },
];

/** 积分兑换记录 */
export const MOCK_POINT_EXCHANGES: PointExchangeRecord[] = [
  // campId 与对应商品 pp1(camp1)/pp2(camp2)/pp3(camp1) 一致，避免无归属导致营期视图口径不一致
  { id: 'pe1', studentId: 's1', studentName: '李明', productId: 'pp1', productName: '运动水杯', productImage: rewardImg('运动水杯', '🥤', '#1677FF', '#0099CC'), pointsSpent: 30, exchangeDate: iso(-3, '14:30:00'), status: 'fulfilled', deliveryMethod: 'shipped', trackingNumber: 'SF1024567890', shipDate: iso(-2, '10:00:00'), recipientName: '李明', recipientPhone: '13800001111', recipientAddress: '北京市海淀区中关村大街1号', campId: 'camp1' },
  { id: 'pe2', studentId: 's7', studentName: '郑爽', productId: 'pp2', productName: '跳绳', productImage: rewardImg('跳绳', '🤸', '#FF976A', '#FF6B35'), pointsSpent: 50, exchangeDate: iso(-1, '09:15:00'), status: 'pending', deliveryMethod: 'shipped', recipientName: '郑爽', recipientPhone: '13800000007', recipientAddress: '上海市浦东新区张江路100号', campId: 'camp2' },
  { id: 'pe3', studentId: 's3', studentName: '张伟', productId: 'pp3', productName: '瑜伽垫', productImage: rewardImg('瑜伽垫', '🧘', '#07C160', '#04A551'), pointsSpent: 80, exchangeDate: iso(-5, '16:20:00'), status: 'fulfilled', deliveryMethod: 'in-person', deliveredAt: iso(-4, '14:00:00'), campId: 'camp1' },
  { id: 'pe4', studentId: 's7', studentName: '郑爽', productId: 'pp2', productName: '跳绳', productImage: rewardImg('跳绳', '🤸', '#FF976A', '#FF6B35'), pointsSpent: 50, exchangeDate: iso(-1, '11:00:00'), status: 'cancelled', deliveryMethod: 'shipped', recipientName: '郑爽', recipientPhone: '13800000007', recipientAddress: '上海市浦东新区张江路100号', cancelledAt: iso(-1, '12:34:00'), campId: 'camp2' },
];

/** 营养师手动加减分记录（补录线下打卡积分等） */
export const MOCK_MANUAL_SCORES: ManualScoreRecord[] = [
  { id: 'ms1', studentId: 's1', points: 10, reason: '营前线下打卡补录（5天饮食+运动）', dietitianName: '营养师小王', createdAt: iso(-2, '10:00:00'), date: dateStr(-7), campId: 'camp1' },
  { id: 'ms2', studentId: 's2', points: 6, reason: '线下运动打卡补录', dietitianName: '营养师小王', createdAt: iso(-2, '10:05:00'), date: dateStr(-5), campId: 'camp1' },
  { id: 'ms3', studentId: 's3', points: -2, reason: '打卡作弊扣分', dietitianName: '营养师小王', createdAt: iso(-1, '15:00:00'), date: dateStr(-1), campId: 'camp1' },
];

// ============================================================================
//  演示数据扩充（versionall）
//  ---------------------------------------------------------------------------
//  目标：三端登录后每个页面都有可看的真实感数据，而不是空态。
//  - 新增 s14–s20 学员，覆盖第一期/第二期
//  - s2–s20 生成连续多天的饮食/运动/体重记录，完成度分层（全勤/良好/偶尔/几乎不打卡）
//  - 批注按营养师/教练真实姓名写入 comments[] 并镜像单字段（与 store.addRecordComment 口径一致）
//  - 数据由固定种子生成，日期随“今天”平移，但每天完成模式稳定，刷新不跳变
// ============================================================================

const demoNewStudents = [
  { id: 's14', name: '林悦', age: 29, gender: 'female' as const, phone: '13800000014' },
  { id: 's15', name: '高翔', age: 38, gender: 'male' as const, phone: '13800000015' },
  { id: 's16', name: '何雨', age: 26, gender: 'female' as const, phone: '13800000016' },
  { id: 's17', name: '马超', age: 34, gender: 'male' as const, phone: '13800000017' },
  { id: 's18', name: '唐宁', age: 31, gender: 'female' as const, phone: '13800000018' },
  { id: 's19', name: '郭峰', age: 42, gender: 'male' as const, phone: '13800000019' },
  { id: 's20', name: '苏晴', age: 27, gender: 'female' as const, phone: '13800000020' },
];
demoNewStudents.forEach((s) => {
  if (!MOCK_STUDENTS.some((x) => x.id === s.id)) MOCK_STUDENTS.push(s);
});

const demoNewAccounts: { id: string; name: string; campIds: string[] }[] = [
  { id: 's14', name: '林悦', campIds: ['camp1'] },
  { id: 's15', name: '高翔', campIds: ['camp1'] },
  { id: 's16', name: '何雨', campIds: ['camp1'] },
  { id: 's17', name: '马超', campIds: ['camp1', 'camp2'] },
  { id: 's18', name: '唐宁', campIds: ['camp2'] },
  { id: 's19', name: '郭峰', campIds: ['camp2'] },
  { id: 's20', name: '苏晴', campIds: ['camp2'] },
];
demoNewAccounts.forEach((a, i) => {
  if (!MOCK_ACCOUNTS.some((x) => x.id === a.id)) {
    MOCK_ACCOUNTS.push({
      id: a.id,
      phone: `138000000${14 + i}`,
      name: a.name,
      role: 'student',
      campIds: a.campIds,
      active: true,
      createdAt: iso(-15, '08:00:00'),
    });
  }
});

/** 确定性伪随机：同一种子每次结果一致，保证演示数据稳定 */
function demoRand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

interface DemoProfile {
  id: string;
  campId: 'camp1' | 'camp2';
  /** 打卡完成度 0–1 */
  rate: number;
  startWeight: number;
  /** 批注密度 */
  annotate: number;
  /** 主要批注营养师 */
  dietitian: string;
  /** 主要批注教练 */
  coach: string;
}

const demoProfiles: DemoProfile[] = [
  // 仅对尚无打卡数据的学员生成，避免与原有 s1–s8/s12 种子重复计分
  { id: 's10', campId: 'camp1', rate: 0.08, startWeight: 74, annotate: 0.05, dietitian: '王营养师', coach: '李教练' },
  { id: 's13', campId: 'camp1', rate: 0.95, startWeight: 68, annotate: 0.4, dietitian: '王营养师', coach: '李教练' },
  { id: 's14', campId: 'camp1', rate: 0.8, startWeight: 61, annotate: 0.25, dietitian: '李营养师', coach: '王教练' },
  { id: 's15', campId: 'camp1', rate: 0.55, startWeight: 90, annotate: 0.18, dietitian: '王营养师', coach: '李教练' },
  { id: 's16', campId: 'camp1', rate: 0.68, startWeight: 57, annotate: 0.2, dietitian: '李营养师', coach: '王教练' },
  { id: 's17', campId: 'camp1', rate: 0.76, startWeight: 84, annotate: 0.26, dietitian: '王营养师', coach: '李教练' },
  { id: 's10', campId: 'camp2', rate: 0.33, startWeight: 74, annotate: 0.1, dietitian: '李营养师', coach: '李教练' },
  { id: 's13', campId: 'camp2', rate: 0.92, startWeight: 68, annotate: 0.9, dietitian: '李营养师', coach: '王教练' },
  { id: 's17', campId: 'camp2', rate: 0.7, startWeight: 84, annotate: 0.2, dietitian: '王营养师', coach: '李教练' },
  { id: 's18', campId: 'camp2', rate: 0.85, startWeight: 59, annotate: 0.28, dietitian: '李营养师', coach: '王教练' },
  { id: 's19', campId: 'camp2', rate: 0.5, startWeight: 96, annotate: 0.15, dietitian: '王营养师', coach: '李教练' },
  { id: 's20', campId: 'camp2', rate: 0.7, startWeight: 66, annotate: 0.2, dietitian: '李营养师', coach: '王教练' },
];

const demoMealText = {
  breakfast: ['燕麦粥 + 水煮蛋 + 无糖豆浆', '全麦面包两片 + 煎蛋 + 牛奶', '小米粥 + 鸡蛋 + 凉拌黄瓜', '玉米一根 + 鸡蛋羹 + 黑咖啡'],
  lunch: ['香煎鸡胸肉 + 糙米饭 + 西兰花', '清蒸鱼 + 杂粮饭 + 时蔬', '牛肉沙拉 + 藜麦', '番茄牛腩 + 半碗米饭 + 青菜'],
  dinner: ['紫薯 + 虾仁 + 生菜', '豆腐 + 菌菇汤 + 少量杂粮饭', '三文鱼 + 芦笋 + 南瓜', '鸡胸肉卷 + 蔬菜沙拉'],
};
const demoExerciseTypes = ['快走', '跑步', '力量训练', '跳绳', '游泳', '骑行', '瑜伽'];
const dietitianComments = [
  '早餐蛋白质够，主食可以再减一点。',
  '午餐搭配标准，继续保持。',
  '晚餐主食偏多，建议换成粗粮半份。',
  '蔬菜量不错，油少一点会更好。',
  '今天整体达标，注意补充饮水。',
];
const coachComments = [
  '配速稳定，心率区间控制得不错。',
  '动作标准，核心收紧的细节再注意一下。',
  '运动量合适，记得拉伸放松。',
  '强度可以再提一档，注意别受伤。',
  '今天完成得很好，保持节奏。',
];

function demoAnnotation(seed: string, text: string, author: string, role: 'dietitian' | 'coach', dayOffset: number, read: boolean) {
  return {
    comments: [{ id: `cm_${seed}`, role, name: author, text, date: iso(dayOffset, '21:10:00') }],
    commentRead: read,
  };
}

demoProfiles.forEach((p) => {
  const startOffset = p.campId === 'camp1' ? -15 : -2;
  const days = 0 - startOffset + 1;
  let weight = p.startWeight;
  for (let i = 0; i < days; i++) {
    const off = startOffset + i;
    // 体验学员：今天不预置任何打卡记录，保证登录后早餐/午餐/晚餐、运动、体重都能现场演示打卡
    if (p.id === 's13' && off === 0) continue;
    const dayKey = `${p.id}_${p.campId}_${i}`;
    // 首日强制有记录：保证每位学员都有营前体重基线，首页「较开营」不为 0
    const active = i === 0 || demoRand(dayKey + 'active') < p.rate;
    if (!active) continue;

    const isRecent = off >= -2;
    const read = !isRecent;

    (['breakfast', 'lunch', 'dinner'] as const).forEach((meal, mi) => {
      const hit = demoRand(dayKey + meal) < Math.min(0.98, p.rate + 0.12);
      if (!hit) return;
      const doAnno = demoRand(dayKey + 'ann' + meal) < p.annotate;
      const seed = `dm_${p.id}_${p.campId}_${i}_${mi}`;
      const annoText = dietitianComments[Math.floor(demoRand(seed + 't') * dietitianComments.length)];
      MOCK_DIET_RECORDS.push({
        id: seed,
        studentId: p.id,
        campId: p.campId,
        date: iso(off, meal === 'breakfast' ? '08:05:00' : meal === 'lunch' ? '12:20:00' : '18:40:00'),
        meal,
        description: demoMealText[meal][Math.floor(demoRand(seed + 'm') * 4)],
        photos: [],
        hasStaple: demoRand(seed + 's') > 0.2,
        hasProtein: demoRand(seed + 'p') > 0.15,
        hasVegetable: demoRand(seed + 'v') > 0.25,
        ...(doAnno
          ? {
              ...demoAnnotation(seed, annoText, p.dietitian, 'dietitian', off, read),
              dietitianComment: annoText,
              dietitianName: p.dietitian,
              dietitianCommentDate: iso(off, '21:10:00'),
              dietitianScore: (demoRand(seed + 'sc') > 0.35 ? 2 : 1) as 1 | 2,
            }
          : {}),
      });
    });

    if (demoRand(dayKey + 'ex') < Math.min(0.95, p.rate + 0.1)) {
      const seed = `de_${p.id}_${p.campId}_${i}`;
      const doAnno = demoRand(dayKey + 'exann') < p.annotate;
      const annoText = coachComments[Math.floor(demoRand(seed + 't') * coachComments.length)];
      MOCK_EXERCISE_RECORDS.push({
        id: seed,
        studentId: p.id,
        campId: p.campId,
        date: iso(off, '19:10:00'),
        type: demoExerciseTypes[Math.floor(demoRand(seed + 'ty') * demoExerciseTypes.length)],
        duration: 25 + Math.floor(demoRand(seed + 'd') * 45),
        intensity: 2 + Math.floor(demoRand(seed + 'i') * 4),
        notes: '',
        photos: [],
        ...(doAnno
          ? {
              ...demoAnnotation(seed, annoText, p.coach, 'coach', off, read),
              coachComment: annoText,
              coachName: p.coach,
              coachCommentDate: iso(off, '21:30:00'),
              coachScore: (demoRand(seed + 'sc') > 0.3 ? 2 : 1) as 1 | 2,
            }
          : {}),
      });
    }

    // 体重：每 2 天一次，整体缓慢下降；最后一天保证有记录（演示趋势与结营报告）
    // 体验学员第一期：每天一条体重，线性从 68 降到 63.5，与结营体测的营后体重对齐
    const demoCamp1 = p.id === 's13' && p.campId === 'camp1';
    if (demoCamp1 || demoRand(dayKey + 'wt') < p.rate * 0.65 || i <= 1 || i === days - 1) {
      const seed = `dw_${p.id}_${p.campId}_${i}`;
      if (demoCamp1) {
        weight = Number((p.startWeight - (p.startWeight - 63.5) * (i / Math.max(1, days - 2))).toFixed(1));
      } else if (i > 0) weight = Math.max(p.startWeight - 8, weight - 0.18 - demoRand(seed) * 0.12);
      const doAnno = demoRand(dayKey + 'wtann') < p.annotate * 0.6;
      const annoText = '体重下降节奏很好，注意蛋白摄入别掉。';
      MOCK_WEIGHT_RECORDS.push({
        id: seed,
        studentId: p.id,
        campId: p.campId,
        date: iso(off, '07:10:00'),
        weight: Number(weight.toFixed(1)),
        photos: [],
        ...(doAnno
          ? {
              ...demoAnnotation(seed, annoText, p.dietitian, 'dietitian', off, read),
              dietitianComment: annoText,
              dietitianName: p.dietitian,
              dietitianCommentDate: iso(off, '21:00:00'),
            }
          : {}),
      });
    }
  }
});

// 新学员的体测指标：以 s1 基线按比例生成营前/营后值，保证结营报告与指标变化统计有内容
const demoMetricIds = ['s5', 's6', 's7', 's8', 's10', 's12', 's13', 's14', 's15', 's16', 's17', 's18', 's19', 's20'];
demoMetricIds.forEach((sid, idx) => {
  if (MOCK_STUDENT_METRIC_VALUES[sid]) return;
  const factor = 0.88 + (idx % 7) * 0.035;
  const values: Record<string, MetricValue> = {};
  Object.entries(MOCK_METRIC_VALUES).forEach(([k, v]) => {
    const before = Number((Number(v.beforeValue ?? 0) * factor).toFixed(2));
    const improve = k.includes('weight') || k.includes('fat') || k.includes('visceral') || k.includes('obesity') || k.includes('tg') || k.includes('ldl') ? 0.92 : 1.02;
    values[k] = { beforeValue: before, afterValue: Number((before * improve).toFixed(2)) };
  });
  MOCK_STUDENT_METRIC_VALUES[sid] = values;
});

// 体验学员 s13 的体重指标与打卡记录对齐（68 → 63.5），报告更可信
if (MOCK_STUDENT_METRIC_VALUES.s13) {
  // 体验学员第一期：给一套完整、方向正确的体成分/代谢/肝肾功能复测数据，
  // 让「健康档案-体检指标」「结营报告-指标变化」「指标变化统计」都有可讲的改善故事。
  Object.assign(MOCK_STUDENT_METRIC_VALUES.s13, {
    'mc_body_weight': { beforeValue: 68, afterValue: 63.5 },
    'mc_body_fat': { beforeValue: 27.2, afterValue: 22.6 },
    'mc_body_muscle': { beforeValue: 40.1, afterValue: 41.0 },
    'mc_body_skeletal': { beforeValue: 30.63, afterValue: 31.24 },
    'mc_body_bmr': { beforeValue: 1580.5, afterValue: 1608 },
    'mc_body_whr': { beforeValue: 1.04, afterValue: 0.93 },
    'mc_body_visceral': { beforeValue: 130.8, afterValue: 98.2 },
    'mc_body_obesity': { beforeValue: 136.25, afterValue: 118.4 },
    'mc_body_cell': { beforeValue: 38.7, afterValue: 39.6 },
    'mc_body_edema': { beforeValue: 0.44, afterValue: 0.39 },
    'mc_body_asmi': { beforeValue: 7.6, afterValue: 8.0 },
    'mc_body_ainst': { beforeValue: 65, afterValue: 82 },
    'mc_liver_alt': { beforeValue: 59.95, afterValue: 38 },
    'mc_liver_ast': { beforeValue: 42, afterValue: 30 },
    'mc_liver_ggt': { beforeValue: 70, afterValue: 45 },
    'mc_kidney_ua': { beforeValue: 490.5, afterValue: 410 },
    'mc_bl_tc': { beforeValue: 6.0, afterValue: 5.1 },
    'mc_bl_tg': { beforeValue: 2.29, afterValue: 1.6 },
    'mc_bl_hdl': { beforeValue: 1.0, afterValue: 1.3 },
    'mc_bl_ldl': { beforeValue: 3.8, afterValue: 3.0 },
    'mc_bs_fasting': { beforeValue: 6.32, afterValue: 5.5 },
    'mc_bs_hba1c': { beforeValue: 6.3, afterValue: 5.8 },
  });
}

// 补充兑换/领取/补录，演示发放中心与学员「我的奖励」
MOCK_POINT_EXCHANGES.push(
  { id: 'pe5', studentId: 's13', studentName: '体验学员', productId: 'pp1', productName: '运动水杯', productImage: rewardImg('运动水杯', '🥤', '#1677FF', '#0099CC'), pointsSpent: 30, exchangeDate: iso(-1, '10:20:00'), status: 'pending', deliveryMethod: 'shipped', recipientName: '体验学员', recipientPhone: '13900000009', recipientAddress: '北京市朝阳区建国路 88 号', campId: 'camp1' },
  { id: 'pe6', studentId: 's2', studentName: '王丽', productId: 'pp3', productName: '瑜伽垫', productImage: rewardImg('瑜伽垫', '🧘', '#07C160', '#04A551'), pointsSpent: 80, exchangeDate: iso(-2, '15:40:00'), status: 'fulfilled', deliveryMethod: 'in-person', deliveredAt: iso(-1, '14:00:00'), campId: 'camp1' },
  { id: 'pe7', studentId: 's18', studentName: '唐宁', productId: 'pp2', productName: '跳绳', productImage: rewardImg('跳绳', '🤸', '#FF976A', '#FF6B35'), pointsSpent: 50, exchangeDate: iso(0, '09:05:00'), status: 'pending', deliveryMethod: 'shipped', recipientName: '唐宁', recipientPhone: '13800000018', recipientAddress: '杭州市西湖区文三路 66 号', campId: 'camp2' },
);
MOCK_REWARD_CLAIMS.push(
  { id: 'c3', campId: 'camp1', tierId: 't1', studentId: 's13', studentName: '体验学员', recipientName: '体验学员', recipientPhone: '13900000009', recipientAddress: '北京市朝阳区建国路 88 号', claimDate: iso(-1, '09:30:00'), status: 'pending', deliveryMethod: 'shipped' },
  { id: 'c4', campId: 'camp2', tierId: 't0', studentId: 's18', studentName: '唐宁', recipientName: '唐宁', recipientPhone: '13800000018', recipientAddress: '杭州市西湖区文三路 66 号', claimDate: iso(-1, '16:00:00'), status: 'shipped', trackingNumber: 'SF1099238811', shipDate: iso(0, '10:00:00'), deliveryMethod: 'shipped' },
);
MOCK_MANUAL_SCORES.push(
  { id: 'ms4', studentId: 's13', points: 8, reason: '线下体测与饮食指导补录', dietitianName: '王营养师', createdAt: iso(-1, '11:00:00'), date: dateStr(-3), campId: 'camp1' },
  { id: 'ms5', studentId: 's18', points: 5, reason: '线下打卡补录', dietitianName: '李营养师', createdAt: iso(0, '09:40:00'), date: dateStr(-1), campId: 'camp2' },
);

// 第二期打卡奖励档位（原种子只有第一期档位，导致第二期学员「我的奖励」为空）
if (!MOCK_REWARD_TIERS.some((t) => t.campId === 'camp2')) {
  MOCK_REWARD_TIERS.push(
    { id: 't4', campId: 'camp2', name: '运动毛巾', requiredDays: 3, imageUrl: rewardImg('运动毛巾', '🧴', '#1677FF', '#0B6BCB'), stock: 60, source: 'streak', description: '速干运动毛巾，健身通勤两用', deliveryMethods: ['shipped', 'in-person'] },
    { id: 't5', campId: 'camp2', name: '运动水杯', requiredDays: 7, imageUrl: rewardImg('运动水杯', '🥤', '#07C160', '#06A952'), stock: 40, source: 'streak', description: '便携运动水杯 500ml，BPA-free 材质', deliveryMethods: ['shipped', 'in-person'] },
    { id: 't6', campId: 'camp2', name: '瑜伽垫', requiredDays: 14, imageUrl: rewardImg('瑜伽垫', '🧘', '#8B5CF6', '#7C3AED'), stock: 20, source: 'streak', description: '加厚防滑瑜伽垫 6mm，TPE 环保材质', deliveryMethods: ['shipped', 'in-person'] },
    { id: 't7', campId: 'camp2', name: '智能体脂秤', requiredDays: 28, imageUrl: rewardImg('智能体脂秤', '⚖️', '#374151', '#1F2937'), stock: 5, source: 'streak', description: '智能体脂秤，连接手机同步记录', deliveryMethods: ['shipped'] },
  );
}
MOCK_REWARD_CLAIMS.push(
  { id: 'c5', campId: 'camp2', tierId: 't4', studentId: 's13', studentName: '体验学员', recipientName: '体验学员', recipientPhone: '13900000009', recipientAddress: '北京市朝阳区建国路 88 号', claimDate: iso(0, '08:40:00'), status: 'pending', deliveryMethod: 'in-person' },
  { id: 'c6', campId: 'camp2', tierId: 't4', studentId: 's7', studentName: '郑爽', recipientName: '郑爽', recipientPhone: '13800000007', recipientAddress: '上海市浦东新区张江路 100 号', claimDate: iso(-1, '10:00:00'), status: 'shipped', trackingNumber: 'SF1088776655', shipDate: iso(0, '09:30:00'), deliveryMethod: 'shipped' },
);
MOCK_POINT_EXCHANGES.push(
  { id: 'pe8', studentId: 's13', studentName: '体验学员', productId: 'pp2', productName: '跳绳', productImage: rewardImg('跳绳', '🤸', '#FF976A', '#FF6B35'), pointsSpent: 50, exchangeDate: iso(0, '09:10:00'), status: 'pending', deliveryMethod: 'shipped', recipientName: '体验学员', recipientPhone: '13900000009', recipientAddress: '北京市朝阳区建国路 88 号', campId: 'camp2' },
);

// 演示积分：饮食/运动分依赖营养师逐条评分，演示账号可用积分容易为 0，导致积分商城无法兑换。
// 这里按营期为学员补录「开营前线下打卡」积分，保证每人至少能兑换一档商品；不影响已消费记录口径。
const demoPointSeeds: { sid: string; name: string; campId: string; points: number }[] = [
  { sid: 's13', name: '体验学员', campId: 'camp1', points: 100 },
  { sid: 's13', name: '体验学员', campId: 'camp2', points: 150 },
  { sid: 's1', name: '李明', campId: 'camp1', points: 60 },
  { sid: 's2', name: '王丽', campId: 'camp1', points: 90 },
  { sid: 's3', name: '张伟', campId: 'camp1', points: 70 },
  { sid: 's4', name: '赵静', campId: 'camp1', points: 70 },
  { sid: 's5', name: '周杰', campId: 'camp1', points: 50 },
  { sid: 's6', name: '吴磊', campId: 'camp1', points: 90 },
  { sid: 's10', name: '孙悟空', campId: 'camp1', points: 20 },
  { sid: 's14', name: '林悦', campId: 'camp1', points: 80 },
  { sid: 's15', name: '高翔', campId: 'camp1', points: 60 },
  { sid: 's16', name: '何雨', campId: 'camp1', points: 70 },
  { sid: 's17', name: '马超', campId: 'camp1', points: 80 },
  { sid: 's6', name: '吴磊', campId: 'camp2', points: 90 },
  { sid: 's7', name: '郑爽', campId: 'camp2', points: 80 },
  { sid: 's8', name: '王强', campId: 'camp2', points: 60 },
  { sid: 's10', name: '孙悟空', campId: 'camp2', points: 30 },
  { sid: 's12', name: '陈曦', campId: 'camp2', points: 50 },
  { sid: 's17', name: '马超', campId: 'camp2', points: 80 },
  { sid: 's18', name: '唐宁', campId: 'camp2', points: 100 },
  { sid: 's19', name: '郭峰', campId: 'camp2', points: 40 },
  { sid: 's20', name: '苏晴', campId: 'camp2', points: 60 },
];
demoPointSeeds.forEach((d, i) => {
  MOCK_MANUAL_SCORES.push({
    id: `ms_point_${i + 1}`,
    studentId: d.sid,
    points: d.points,
    reason: '开营前线下打卡补录（饮食 + 运动）',
    dietitianName: '王营养师',
    createdAt: iso(-2, '09:20:00'),
    date: dateStr(-8),
    campId: d.campId,
  });
});

// ============================================================================
//  营期级体测数据
//  ---------------------------------------------------------------------------
//  原 MOCK_STUDENT_METRIC_VALUES 只有 studentId 维度，多期学员会把第一期的「结营后」
//  值带进刚开营的第二期（开营 3 天显示减重 4.5kg、误发减重徽章）。这里按营期取值：
//  - 第一期：有完整营前/营后复测
//  - 第二期 / 第三期：仅营前值，营后值置空（阶段性报告不展示改善、不判定减重徽章）
// ============================================================================
const DEMO_METRIC_CAMP1_IDS = ['s1','s2','s3','s4','s5','s6','s7','s8','s10','s12','s13','s14','s15','s16','s17','s18','s19','s20'];

export function metricValuesFor(studentId: string, campId?: string | null): Record<string, MetricValue> {
  const base = MOCK_STUDENT_METRIC_VALUES[studentId] || {};
  if (!campId || campId === 'camp1') return base;
  // 第二期/第三期：只保留营前值
  const beforeOnly: Record<string, MetricValue> = {};
  Object.entries(base).forEach(([k, v]) => { beforeOnly[k] = { beforeValue: v.beforeValue, afterValue: null }; });
  return beforeOnly;
}

/** 某营期是否有结营复测数据（用于报告/统计判断） */
export function hasCampMetricReview(campId?: string | null): boolean {
  return campId === 'camp1';
}

/** 兼容：列出有营前数据的学员（第一期演示用） */
export const DEMO_METRIC_CAMP1_STUDENT_IDS = DEMO_METRIC_CAMP1_IDS;

/** 演示数据版本：用于本机旧快照的一次性增量合并（改动 mock 种子时 +1） */
export const DEMO_SCHEMA_VERSION = 3;

/** 体验学员（s13）的入营问卷种子：首次登录自动写入本机，保证健康档案/自查问卷不是空白 */
export const MOCK_QUESTIONNAIRE_S13 = {
  gender: 'female',
  age: '30',
  height: '168',
  weight: '68',
  targetWeight: '60',
  hasChronic: '无',
  chronicDetails: '',
  hasSpecialDiet: '无',
  specialDietDetails: '',
  hasFoodAllergy: '无',
  foodAllergyDetails: '',
  sleepTime: '23:00',
  wakeTime: '07:00',
  sleepDuration: '8',
  drinkAlcohol: '从不',
  smoke: '从不',
  snack: '否',
  dailyWater: '1800',
  exerciseFrequency: '3',
  exerciseDuration: '45',
  exerciseTypes: ['快走', '瑜伽', '力量训练'],
  medicalReports: [],
};
