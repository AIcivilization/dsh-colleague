/**
 * Web 面板浏览器预览入口
 * 直接导入已有的 web/main.tsx registerPanel，注入 mock 数据
 */
import { registerPanel } from '../../web/main'

// ===== Mock 数据 =====
const mockMembers = [
  { id: 'leader-01', name: '组长', role: 'leader' as const, provider: 'dsh', model: 'deepseek', slotId: 0 },
  { id: 'coder-01', name: '码农', role: 'coder' as const, provider: 'dsh', model: 'deepseek', slotId: 1 },
  { id: 'reviewer-01', name: '审核员', role: 'reviewer' as const, provider: 'dsh', model: 'deepseek', slotId: 2 },
  { id: 'tester-01', name: '测试员', role: 'tester' as const, provider: 'dsh', model: 'deepseek', slotId: 3 },
  { id: 'docs-01', name: '文档员', role: 'docs' as const, provider: 'dsh', model: 'deepseek', slotId: 4 },
]

const mockTasks: any[] = [
  {
    id: 'task-001', title: '实现登录页面', description: '创建 Login.tsx 组件，包含用户名密码输入和提交按钮',
    assigneeId: 'coder-01', role: 'coder', status: 'passed',
    dependencies: [], createdAt: Date.now() - 60000, updatedAt: Date.now() - 30000,
    result: { status: 'completed', summary: '登录页实现完成，包含表单验证和提交逻辑', artifacts: ['src/Login.tsx'], issues: [] },
    quality: { status: 'approved', reviewerId: 'reviewer-01', issues: [], summary: '代码质量良好，通过审核', timestamp: Date.now() - 20000 },
  },
  {
    id: 'task-002', title: '审核登录页面', description: 'code review Login.tsx',
    assigneeId: 'reviewer-01', role: 'reviewer', status: 'passed',
    dependencies: ['task-001'], createdAt: Date.now() - 30000, updatedAt: Date.now() - 20000,
    result: { status: 'completed', summary: '审核通过', artifacts: [], issues: [] },
  },
  {
    id: 'task-003', title: '编写单元测试', description: '为登录组件编写测试用例',
    assigneeId: 'tester-01', role: 'tester', status: 'running',
    dependencies: ['task-001'], createdAt: Date.now() - 10000, updatedAt: Date.now() - 5000,
  },
]

const mockEvents: any[] = [
  { id: 'e1', type: 'team_created', teamId: 'test-team', data: { members: mockMembers }, timestamp: Date.now() - 60000 },
  { id: 'e2', type: 'task_created', teamId: 'test-team', taskId: 'task-001', data: { task: mockTasks[0], summary: '创建任务：实现登录页面' }, timestamp: Date.now() - 55000 },
  { id: 'e3', type: 'task_started', teamId: 'test-team', taskId: 'task-001', memberId: 'coder-01', data: { summary: '码农开始实现登录页面' }, timestamp: Date.now() - 50000 },
  { id: 'e4', type: 'task_completed', teamId: 'test-team', taskId: 'task-001', memberId: 'coder-01', data: { summary: '登录页实现完成', status: 'passed' }, timestamp: Date.now() - 30000 },
  { id: 'e5', type: 'quality_recorded', teamId: 'test-team', taskId: 'task-001', memberId: 'reviewer-01', data: { quality: { status: 'approved', summary: '审核通过' }, summary: '审核通过' }, timestamp: Date.now() - 20000 },
  { id: 'e6', type: 'task_started', teamId: 'test-team', taskId: 'task-003', memberId: 'tester-01', data: { summary: '测试员开始编写单元测试' }, timestamp: Date.now() - 5000 },
]

const mockState = {
  id: 'test-team',
  name: '前端项目组',
  status: 'running' as const,
  members: mockMembers,
  tasks: mockTasks,
  events: mockEvents,
  workspace: '/tmp/workspace',
  createdAt: Date.now() - 60000,
  updatedAt: Date.now(),
}

const mockRuntime = {
  getSnapshot: () => mockState,
  subscribe: (listener: (event: any) => void) => {
    setTimeout(() => {
      const newEvent = { id: 'e7', type: 'task_completed', teamId: 'test-team', taskId: 'task-003', memberId: 'tester-01', data: { summary: '测试编写完成，全部通过', status: 'passed' }, timestamp: Date.now() }
      mockEvents.push(newEvent)
      mockTasks[2].status = 'passed'
      mockTasks[2].result = { status: 'completed', summary: '5 个测试用例全部通过', artifacts: ['src/Login.test.tsx'], issues: [] }
      mockState.updatedAt = Date.now()
      listener(newEvent)
    }, 5000)
    return () => {}
  },
  getEvents: (since?: number) => since ? mockEvents.filter(e => e.timestamp > since) : mockEvents,
  handleIntervention: (cmd: any) => console.log('intervention:', cmd),
}

const mount = document.getElementById('root')!
registerPanel(mount, mockRuntime)
