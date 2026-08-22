/**
 * Web panel browser preview entry
 * Directly imports web/main.tsx registerPanel, registers with mock data
 */
import { registerPanel } from '../../web/main'

// ===== Mock data =====
const mockMembers = [
  { id: 'leader-01', name: 'Lead', role: 'leader' as const, provider: 'dsh', model: 'deepseek', slotId: 0 },
  { id: 'coder-01', name: 'Coder', role: 'coder' as const, provider: 'dsh', model: 'deepseek', slotId: 1 },
  { id: 'reviewer-01', name: 'Reviewer', role: 'reviewer' as const, provider: 'dsh', model: 'deepseek', slotId: 2 },
  { id: 'tester-01', name: 'Tester', role: 'tester' as const, provider: 'dsh', model: 'deepseek', slotId: 3 },
  { id: 'docs-01', name: 'Doc Writer', role: 'docs' as const, provider: 'dsh', model: 'deepseek', slotId: 4 },
]

const mockTasks: any[] = [
  {
    id: 'task-001', title: 'Implement login page', description: 'Create Login.tsx component with username, password inputs and submit button',
    assigneeId: 'coder-01', role: 'coder', status: 'passed',
    dependencies: [], createdAt: Date.now() - 60000, updatedAt: Date.now() - 30000,
    result: { status: 'completed', summary: 'Login page implementation done, includes form validation and submit logic', artifacts: ['src/Login.tsx'], issues: [] },
    quality: { status: 'approved', reviewerId: 'reviewer-01', issues: [], summary: 'Code quality is good, review passed', timestamp: Date.now() - 20000 },
  },
  {
    id: 'task-002', title: 'Review login page', description: 'Code review Login.tsx',
    assigneeId: 'reviewer-01', role: 'reviewer', status: 'passed',
    dependencies: ['task-001'], createdAt: Date.now() - 30000, updatedAt: Date.now() - 20000,
    result: { status: 'completed', summary: 'Review passed', artifacts: [], issues: [] },
  },
  {
    id: 'task-003', title: 'Unit test', description: 'Write unit tests for the login component',
    assigneeId: 'tester-01', role: 'tester', status: 'running',
    dependencies: ['task-001'], createdAt: Date.now() - 10000, updatedAt: Date.now() - 5000,
  },
]

const mockEvents: any[] = [
  { id: 'e1', type: 'team_created', teamId: 'test-team', data: { members: mockMembers }, timestamp: Date.now() - 60000 },
  { id: 'e2', type: 'task_created', teamId: 'test-team', taskId: 'task-001', data: { task: mockTasks[0], summary: 'Created task: Implement login page' }, timestamp: Date.now() - 55000 },
  { id: 'e3', type: 'task_started', teamId: 'test-team', taskId: 'task-001', memberId: 'coder-01', data: { summary: 'Coder started implementing login page' }, timestamp: Date.now() - 50000 },
  { id: 'e4', type: 'task_completed', teamId: 'test-team', taskId: 'task-001', memberId: 'coder-01', data: { summary: 'Login page implementation done', status: 'passed' }, timestamp: Date.now() - 30000 },
  { id: 'e5', type: 'quality_recorded', teamId: 'test-team', taskId: 'task-001', memberId: 'reviewer-01', data: { quality: { status: 'approved', summary: 'Review passed' }, summary: 'Review passed' }, timestamp: Date.now() - 20000 },
  { id: 'e6', type: 'task_started', teamId: 'test-team', taskId: 'task-003', memberId: 'tester-01', data: { summary: 'Tester started unit tests' }, timestamp: Date.now() - 5000 },
]

const mockState = {
  id: 'test-team',
  name: 'Frontend Team',
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
      const newEvent = { id: 'e7', type: 'task_completed', teamId: 'test-team', taskId: 'task-003', memberId: 'tester-01', data: { summary: 'Unit tests done, all passed', status: 'passed' }, timestamp: Date.now() }
      mockEvents.push(newEvent)
      mockTasks[2].status = 'passed'
      mockTasks[2].result = { status: 'completed', summary: '5 test cases all passed', artifacts: ['src/Login.test.tsx'], issues: [] }
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
