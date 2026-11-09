import { DomainPreset } from '../types';

export interface DomainPresetInfo {
  id: DomainPreset;
  name: string;
  icon: string;
  description: string;
  defaultHotwords: string;
}

export const DOMAIN_PRESETS: Record<DomainPreset, DomainPresetInfo> = {
  battery: {
    id: 'battery',
    name: '⚡ 新能源与电池化学 (默认)',
    icon: '🔋',
    description: '全面涵盖磷酸铁锂、固态电池、NCM811、CATL/BYD、SEI膜、热失控、电解液、GWh/TWh等200+行业专有名词',
    defaultHotwords: '磷酸铁锂, 锂离子电池, 固态电池, 钠离子电池, 三元锂, NCM811, NCM622, NCM523, NCA, 硅碳负极, 石墨负极, 硅氧负极, 锂金属负极, 硬碳负极, 软碳负极, 电解液, 隔膜, 正极, 负极, 叠片工艺, 卷绕, 涂布, BMS, 电池管理系统, SOC, SOH, 4680, 21700, 18650, 能量密度, C速率, 充放电倍率, 针刺测试, 热失控, 析锂, 枝晶, 锂枝晶, 库仑效率, 极化, 比容量, 循环寿命, 自放电, 宁德时代, 比亚迪, 刀片电池, 神行电池, 麒麟电池, 亿纬锂能, 硫化物固态电池, 氧化物固态电池, 聚合物固态电池, 普鲁士蓝, 普鲁士白, 磷酸锰铁锂, LMFP, 碳纳米管, CNT, 导电浆料, 导电剂, 复合铜箔, 复合铝箔, 铝塑膜, 干法隔膜, 湿法隔膜, 涂覆隔膜, 六氟磷酸锂, LiPF6, 双氟磺酰亚胺锂, LiFSI, 锂盐, 溶剂, 添加剂, 电池级碳酸锂, 电池级氢氧化锂, 工业级碳酸锂, 锂精矿, 盐湖提锂, 锂辉石, 锂云母, 钴酸锂, 锰酸锂, 富锂锰基, 无钴电池, 钛酸锂, PVDF粘结剂, CMC, SBR, 锂硫电池, 锂空气电池, 凝胶电解质, 固态电解质, 离子电导率, 大圆柱电池, 方壳电池, 软包电池, CTC, Cell to Chassis, CTP, CTV, CTB, DOD, C-rate, 卷绕工艺, 极片涂布, 辊压, 分切, 模切, 注液, 化成老化, 预充, 挤压测试, 热箱测试, 热扩散, 首效, SEI膜, CEI膜, 极化电压, 内阻, 日历寿命, 体积能量密度, 重量能量密度, 功率密度, 过充, 过放, 热管理, 水冷板, 液冷, 气冷, 电芯热仿真, PACK包, 模组, 线束, 高压连接器, 绝缘设计, 泄压阀, CATL, BYD, 弗迪电池, EVE, 中创新航, CALB, 蜂巢能源, 欣旺达, 瑞浦兰钧, 国轩高科, 远景动力, 孚能科技, 特斯拉, Tesla, LG新能源, 松下, 三星SDI, SK On, 赣锋锂业, 天齐锂业, 华友钴业, 容百科技, 当升科技, 恩捷股份, 星源材质, 天赐材料, 新宙邦, 璞泰来, 杉杉股份, 先导智能, 赢合科技, 杭可科技, 天奈科技, 中科电气, 格林美, 厦钨新能, 德方纳米, 多氟多, 天际股份, 石大胜华, 光华科技, 诺德股份, 嘉元科技, 中一科技, 蓝晓科技, 藏格矿业, 永兴材料, 神行超充电池, 骁遥超级增混电池, 金砖电池, 弹匣电池, 龙鳞电池, 麒麟2.0, 短刀电池, 蜂巢短刀, 大禹电池, 擎天柱电池, M3P电池, 动力电池, 储能电池, 户用储能, 电网储能, 工商业储能, 消费电池, 动力锂电池, 锂电回收, 梯次利用, 湿法回收, 火法回收, 再生锂, 碳足迹, 电池护照, 双积分, 锂电出海, 海外建厂, 锂价, 电池招标, 产能爬坡, 良率, 海外认证, UL认证, UN38.3, 电池安全标准, 车规级, GWh, TWh, 电池产能, 产能利用率, 原材料保供, 电池出海, 电池关税, 废旧动力电池'
  },
  tech: {
    id: 'tech',
    name: '💻 互联网 / AI / 前沿科技',
    icon: '🤖',
    description: '大语言模型、LLM、Transformer、微调、RAG、向量数据库、Agent、提示词工程、Kubernetes等',
    defaultHotwords: '大语言模型, LLM, Transformer, 微调, Fine-tuning, RAG, 向量数据库, Agent, 提示词工程, API, RESTful, GraphQL, Kubernetes, Docker, CI/CD, React, TypeScript, AIGC, 扩散模型'
  },
  finance: {
    id: 'finance',
    name: '📈 财经 / 投资 / 商业金融',
    icon: '📊',
    description: '市盈率、EBITDA、资产负债率、自由现金流、ROE、估值、IPO、降息、避险资产等',
    defaultHotwords: '市盈率, PE, PB, EBITDA, 资产负债率, 自由现金流, 净资产收益率, ROE, 边际效益, 估值, IPO, 纳斯达克, 降息, 通货膨胀, 避险资产, 加权平均资本成本, WACC'
  },
  medical: {
    id: 'medical',
    name: '⚕️ 医药 / 生物科技',
    icon: '🧪',
    description: '靶向药、临床试验、FDA、靶点、免疫治疗、单克隆抗体、mRNA、基因测序等',
    defaultHotwords: '靶向药, 临床试验, FDA, 靶点, 免疫治疗, 单克隆抗体, mRNA, 基因测序, 临床III期, 阳性率, 不良反应, 药代动力学, 作用机制'
  },
  general: {
    id: 'general',
    name: '🌐 通用日常',
    icon: '💬',
    description: '标准日常通用听写语料',
    defaultHotwords: ''
  },
  custom: {
    id: 'custom',
    name: '✍️ 自定义专属词库',
    icon: '📝',
    description: '完全由您自定义输入的行业专属热词与专有名词表',
    defaultHotwords: ''
  }
};

export function getEffectiveHotwords(domainPreset: DomainPreset, customHotwords?: string): string {
  const preset = DOMAIN_PRESETS[domainPreset];
  const base = preset ? preset.defaultHotwords : '';
  const extra = (customHotwords || '').trim();

  if (domainPreset === 'custom') {
    return extra;
  }

  if (!base) return extra;
  if (!extra) return base;

  // Combine unique terms
  const set = new Set([
    ...base.split(/[,，\n]+/).map(s => s.trim()),
    ...extra.split(/[,，\n]+/).map(s => s.trim())
  ].filter(Boolean));

  return Array.from(set).join(', ');
}
