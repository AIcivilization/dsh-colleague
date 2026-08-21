/**
 * i18n 国际化系统
 * 自动检测系统语言（navigator.language），支持中英文。
 * 
 * 用法：
 *   import { t } from '../i18n';
 *   <span>{t('pause')}</span>
 */

// ===== 支持的语言 =====

export type Lang = 'zh' | 'en';

/** 自动检测系统语言 */
function detectLang(): Lang {
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language.toLowerCase();
    if (lang.startsWith('zh')) return 'zh';
    return 'en';
  }
  return 'en';
}

let currentLang: Lang = detectLang();

/** 手动切换语言 */
export function setLang(lang: Lang): void {
  currentLang = lang;
  // 触发重新渲染（通过事件通知）
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lang-change', { detail: lang }));
  }
}

/** 获取当前语言 */
export function getLang(): Lang {
  return currentLang;
}

// ===== 翻译表 =====

type TranslationKey = string;
type Translations = Record<TranslationKey, { zh: string; en: string }>;

const translations: Translations = {
  // ===== 团队面板标题 =====
  'cli.title': { zh: '同事团队面板', en: 'Colleague Team Panel' },
  'cli.subtitle': { zh: '团队已加载 {count} 个成员，通过 DSH Subagent 执行任务。', en: 'Team loaded with {count} member(s). Tasks run via DSH Subagent.' },
  'cli.goalLabel': { zh: '团队目标（可选）', en: 'Team goal (optional)' },
  'cli.goalPlaceholder': { zh: '例如：做一个带表单验证和错误提示的登录页', en: 'e.g., Build a login page with form validation and error display' },
  'cli.start': { zh: '启动团队', en: 'Start team' },
  'cli.creating': { zh: '正在创建团队…', en: 'Creating team...' },
  'cli.allColleagues': { zh: '所有同事将通过 DSH Subagent 执行任务', en: 'All colleagues will execute tasks via DSH Subagent' },
  'cli.scanning': { zh: '正在加载团队成员…', en: 'Loading team members...' },
  'cli.noneFound': { zh: '团队配置中没有可用成员', en: 'No available members in team config' },
  'cli.install': { zh: '请在 config/team.yaml 中配置成员。', en: 'Please configure members in config/team.yaml.' },
  'cli.cannotConnect': { zh: '无法连接团队运行时。请检查插件是否已加载。', en: 'Cannot connect to team runtime. Check if the plugin is loaded.' },
  'cli.selectFirst': { zh: '请先启动团队', en: 'Please start the team first' },

  // ===== 团队面板 =====
  'team.view': { zh: '视图', en: 'View' },
  'team.parallel': { zh: '并行', en: 'Parallel' },
  'team.single': { zh: '单聊', en: 'Single' },
  'team.board': { zh: '看板', en: 'Board' },

  // ===== 成员栏 =====
  'member.add': { zh: '添加成员', en: 'Add member' },
  'member.pending': { zh: '{count} 个待处理权限请求', en: '{count} pending permission request(s)' },

  // ===== Warmup =====
  'warmup.waking': { zh: '正在唤醒团队…', en: 'Waking up the team…' },
  'warmup.gettingReady': { zh: '正在准备成员', en: 'Getting members ready' },
  'warmup.failedMulti': { zh: '{count} 个成员启动失败', en: '{count} members failed to start' },
  'warmup.failedSingle': { zh: '成员 {name} 启动失败', en: 'Member {name} failed to start' },
  'warmup.failedLeader': { zh: '组长 {name} 启动失败', en: 'Lead {name} failed to start' },
  'warmup.cannotStart': { zh: '团队无法启动', en: 'The team could not start' },
  'warmup.switchModel': { zh: '在上方列头切换模型，然后重试。', en: 'Switch its model in the column header above, then retry.' },
  'warmup.switchOrRemove': { zh: '在上方切换模型，或从顶部成员栏移除该成员，然后重试。', en: 'Switch its model above, or remove the member from the bar on top, then retry.' },
  'warmup.retry': { zh: '重试', en: 'Retry' },
  'warmup.failedToStart': { zh: '启动失败', en: 'failed to start' },
  'warmup.lead': { zh: '组长', en: 'Lead' },

  // ===== 活动控制栏 =====
  'control.newest': { zh: '最新', en: 'Newest' },
  'control.oldest': { zh: '最旧', en: 'Oldest' },
  'control.all': { zh: '全部', en: 'all' },
  'control.messages': { zh: '消息', en: 'messages' },
  'control.tasks': { zh: '任务', en: 'tasks' },
  'control.systemMessages': { zh: '系统消息', en: 'System messages' },
  'control.finishedTasks': { zh: '已完成任务', en: 'Finished tasks' },
  'control.unassigned': { zh: '未分配 / 外部', en: 'Unassigned / external' },

  // ===== 活动看板 =====
  'board.noActivity': { zh: '暂无活动', en: 'No activity yet' },

  // ===== 消息卡片 =====
  'message.broadcast': { zh: '广播给所有人', en: 'Broadcast to all' },
  'message.userExternal': { zh: '用户 / 外部', en: 'User / external' },
  'message.read': { zh: '已读', en: 'Read' },
  'message.unread': { zh: '未读', en: 'Unread' },
  'message.files': { zh: '{count} 个文件', en: '{count} files' },
  'message.expand': { zh: '展开', en: 'Expand' },
  'message.collapse': { zh: '收起', en: 'Collapse' },

  // ===== 任务卡片 =====
  'task.blockedBy': { zh: '被阻塞 #{id}', en: 'blocked by #{id}' },
  'task.expand': { zh: '展开', en: 'Expand' },
  'task.collapse': { zh: '收起', en: 'Collapse' },

  // 任务状态
  'task.status.pending': { zh: '待处理', en: 'pending' },
  'task.status.in_progress': { zh: '进行中', en: 'in_progress' },
  'task.status.completed': { zh: '已完成', en: 'completed' },
  'task.status.failed': { zh: '失败', en: 'failed' },
  'task.status.cancelled': { zh: '已取消', en: 'cancelled' },

  // ===== 介入栏 =====
  'intervention.pause': { zh: '暂停', en: 'Pause' },
  'intervention.resume': { zh: '恢复', en: 'Resume' },
  'intervention.revise': { zh: '修正', en: 'Revise' },
  'intervention.takeover': { zh: '接管', en: 'Takeover' },
  'intervention.skip': { zh: '跳过', en: 'Skip' },
  'intervention.label': { zh: '介入', en: 'Intervention' },
  'intervention.revisePlaceholder': { zh: '输入修正指令…', en: 'Enter revision instruction...' },
  'intervention.send': { zh: '发送', en: 'Send' },
  'intervention.cancel': { zh: '取消', en: 'Cancel' },
};

// ===== 翻译函数 =====

/**
 * 翻译函数
 * @param key 翻译键
 * @param vars 模板变量（如 { name: 'Claude' } 替换 {name}）
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = translations[key];
  if (!entry) return key;
  let text = entry[currentLang] || entry.en;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}
