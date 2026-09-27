import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Button,
  Callout,
  Card,
  Checkbox,
  Divider,
  Elevation,
  FormGroup,
  HTMLSelect,
  Icon,
  InputGroup,
  ProgressBar,
  Tab,
  Tabs,
  Tag,
  TextArea
} from '@blueprintjs/core';

type StepStatus = 'draft' | 'submitted' | 'confirmed' | 'returned';
type ProcessStatus = 'draft' | 'in-review' | 'frozen' | 'revising';
type ViewId = 'editor' | 'review' | 'compare';
type SignoffConclusion = 'pass' | 'reject';
type HazardField = 'control' | 'residualRisk';

interface ReviewComment {
  id: string;
  author: string;
  role: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

interface HazardSignoff {
  author: string;
  role: string;
  conclusion: SignoffConclusion;
  signedAt: string;
}

interface HazardItem {
  id: string;
  name: string;
  control: string;
  residualRisk: string;
  signoff: HazardSignoff | null;
}

interface ProcessStep {
  id: string;
  title: string;
  purpose: string;
  materials: string;
  equipment: string;
  amount: string;
  duration: number;
  hazardItems: HazardItem[];
  dependencies: string[];
  safetyNote: string;
  expectedResult: string;
  status: StepStatus;
  comments: ReviewComment[];
}

interface VersionSnapshot {
  id: string;
  label: string;
  version: string;
  createdAt: string;
  note: string;
  author: string;
  steps: ProcessStep[];
}

interface ExperimentProcess {
  id: string;
  schemaVersion?: number;
  title: string;
  code: string;
  objective: string;
  principal: string;
  lab: string;
  status: ProcessStatus;
  version: string;
  steps: ProcessStep[];
  versions: VersionSnapshot[];
  frozenAt?: string;
  updatedAt: string;
}

interface HistoryState {
  past: ExperimentProcess[];
  present: ExperimentProcess;
  future: ExperimentProcess[];
}

interface DiffItem {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'changed';
  detail: string;
}

interface HazardBlocker {
  hazardId: string;
  hazardName: string;
  reason: string;
}

interface FreezeBlocker {
  stepId: string;
  stepTitle: string;
  stepNotConfirmed: boolean;
  safetyNoteMissing: boolean;
  hazards: HazardBlocker[];
}

const STORAGE_KEY = 'sologsb-1027-lab-safety-v1';
const SCHEMA_VERSION = 2;
const CURRENT_AUTHOR = '周宁';
const CURRENT_ROLE = '安全复核员';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeHazard(name = '', control = '', residualRisk = ''): HazardItem {
  return { id: uid('hazard'), name, control, residualRisk, signoff: null };
}

function passSignoff(signedAt: string): HazardSignoff {
  return { author: '王颖', role: '安全复核员', conclusion: 'pass', signedAt };
}

function initialProcess(): ExperimentProcess {
  const baseSteps: ProcessStep[] = [
    {
      id: 'step-1', title: '核对试剂与实验区域', purpose: '确认所需物料、设备及区域状态符合实验方案。',
      materials: '无水乙醇、去离子水', equipment: '通风柜、防爆柜、标签打印机', amount: '乙醇 120 mL；去离子水 300 mL',
      duration: 15,
      hazardItems: [
        { id: 'hz-1-1', name: '易燃液体', control: '在通风柜内取用，远离点火源；使用接地金属容器。', residualRisk: '通风柜短时故障仍会有局部蒸气积聚，通过每日柜面风速点检与随取随关瓶盖控制。', signoff: passSignoff('2026-09-24T09:40:00+08:00') }
      ],
      dependencies: [], safetyNote: '操作人员需佩戴护目镜和防化手套。', expectedResult: '试剂标签、数量和有效期均核对无误。',
      status: 'confirmed', comments: [
        { id: 'c-1', author: '李明', role: '研究员', text: '已核对批号和有效期，防爆柜温度记录正常。', createdAt: '2026-09-24T09:10:00+08:00', resolved: true }
      ]
    },
    {
      id: 'step-2', title: '搭建恒温循环装置', purpose: '连接循环浴与反应夹套，检查密封和温控。',
      materials: '无', equipment: '恒温循环浴、硅胶管、反应夹套、扎带', amount: '循环液 800 mL',
      duration: 25,
      hazardItems: [
        { id: 'hz-2-1', name: '烫伤', control: '高温表面设置警示标识；装卸接口佩戴防烫手套，升温阶段不触碰夹套。', residualRisk: '取样口附近仍有局部高温，保持面部远离并借助工具操作。', signoff: passSignoff('2026-09-24T10:30:00+08:00') },
        { id: 'hz-2-2', name: '管路脱落', control: '管路双端卡箍固定；升温前完成 5 分钟试压，并设置独立超温断电保护。', residualRisk: '试压合格后软管仍可能老化渗漏，每班升温前复核接头与管路外观。', signoff: passSignoff('2026-09-24T10:32:00+08:00') }
      ],
      dependencies: ['step-1'], safetyNote: '高温表面设置警示标识，循环浴周围保持干燥。', expectedResult: '30 分钟内温度稳定在 55 ± 0.5 ℃。',
      status: 'confirmed', comments: [
        { id: 'c-2', author: '王颖', role: '安全复核员', text: '补充超温断电值，不能只依赖设备自带温控。', createdAt: '2026-09-24T10:05:00+08:00', resolved: true }
      ]
    },
    {
      id: 'step-3', title: '加入催化剂并启动反应', purpose: '按批次加入催化剂，记录起点并开始计时。',
      materials: '催化剂 A', equipment: '分析天平、加料漏斗、计时器', amount: '催化剂 A 2.50 ± 0.02 g',
      duration: 20,
      hazardItems: [
        { id: 'hz-3-1', name: '粉尘吸入', control: '在通风柜内称量，佩戴 N95 口罩；称量后润湿擦拭台面。', residualRisk: '转移过程中仍可能扬起微量粉尘，通过慢速倾倒和一次性称量纸控制。', signoff: null },
        { id: 'hz-3-2', name: '放热反应', control: '分三次少量加入并持续监测温度；超过 70 ℃ 立即停止加料并启动冷却。', residualRisk: '加料间歇仍可能出现温度滞后上升，预留冷却浴并保持搅拌不中断。', signoff: null }
      ],
      dependencies: ['step-2'], safetyNote: '反应温度超过 70 ℃ 时立即停止加料并启动冷却。', expectedResult: '温度缓慢升至 62–66 ℃，无明显冲料。',
      status: 'submitted', comments: []
    },
    {
      id: 'step-4', title: '恒温反应与过程取样', purpose: '维持温度并定时取样观察反应转化。',
      materials: '样品瓶、惰性气体', equipment: '取样针、气相色谱、恒温循环浴', amount: '每点样品约 1 mL，共 6 点',
      duration: 90,
      hazardItems: [
        { id: 'hz-4-1', name: '高温液体', control: '取样前先泄压；使用长针和防护屏，样品瓶置于托盘中。', residualRisk: '针尖残液可能滴落，取样后立即插入废棉垫并更换手套。', signoff: null },
        { id: 'hz-4-2', name: '挥发性气体', control: '取样在通风柜内进行，样品瓶随即封闭，不在台面临时敞口放置。', residualRisk: '封瓶瞬间仍有少量挥发，通过柜内操作和避免正对瓶口控制吸入。', signoff: null }
      ],
      dependencies: ['step-3'], safetyNote: '取样时不得正对瓶口，样品瓶不得完全密封后加热。', expectedResult: '转化率达到 95% 以上且无异常副产物。',
      status: 'submitted', comments: []
    },
    {
      id: 'step-5', title: '停止加热并冷却', purpose: '终止反应并将体系降至安全温度。',
      materials: '无', equipment: '循环浴、温度探头', amount: '降温目标 ≤ 30 ℃', duration: 35,
      hazardItems: [
        { id: 'hz-5-1', name: '烫伤', control: '先停止加料并维持搅拌，再以不超过 1 ℃/min 的速率降温，佩戴防烫手套。', residualRisk: '降温初期夹套仍烫，拆除前再次触温确认并设置隔离围挡。', signoff: null },
        { id: 'hz-5-2', name: '残余反应', control: '温度连续 5 分钟低于 30 ℃ 后方可停止搅拌与拆除装置。', residualRisk: '局部热点可能滞后，拆除时保留冷却水继续运行 10 分钟。', signoff: null }
      ],
      dependencies: ['step-4'], safetyNote: '确认温度连续 5 分钟低于 30 ℃ 后才能拆除装置。', expectedResult: '体系温度稳定低于 30 ℃。',
      status: 'draft', comments: []
    },
    {
      id: 'step-6', title: '废液分类与现场恢复', purpose: '按危险废物要求分类收集并恢复实验区域。',
      materials: '废液桶、吸附棉', equipment: '防化手套、护目镜、危废标签', amount: '按实际产生量记录', duration: 25,
      hazardItems: [
        { id: 'hz-6-1', name: '废液混装', control: '有机废液单独收集，倾倒前核对相容性表，贴签后入防爆废液柜。', residualRisk: '标签脱落可能导致后续误混，双人复核标签并在交接记录中签字。', signoff: null },
        { id: 'hz-6-2', name: '化学暴露', control: '佩戴防化手套和护目镜；泄漏吸附材料浸润后装入危废袋按危废处置。', residualRisk: '手套微量渗透风险，每完成一类废液即更换手套并洗手。', signoff: null }
      ],
      dependencies: ['step-5'], safetyNote: '废液不得倒入下水道，现场恢复后完成双人确认。', expectedResult: '废液交接记录完整，台面无残留。',
      status: 'draft', comments: []
    }
  ];

  const sealStep = (step: ProcessStep, frozenAt: string): ProcessStep => ({
    ...clone(step),
    status: 'confirmed',
    comments: [],
    hazardItems: step.hazardItems.map((hazard) => ({ ...hazard, signoff: hazard.signoff ?? passSignoff(frozenAt) }))
  });

  const firstVersion: VersionSnapshot = {
    id: 'version-1-0', label: '首版批准流程', version: '1.0.0', createdAt: '2026-09-20T14:30:00+08:00',
    note: '建立基础反应与取样步骤。', author: '王颖',
    steps: clone(baseSteps).slice(0, 4).map((step) => sealStep(step, '2026-09-20T14:30:00+08:00'))
  };
  const secondVersion: VersionSnapshot = {
    id: 'version-1-1', label: '补充冷却与废液步骤', version: '1.1.0', createdAt: '2026-09-24T15:10:00+08:00',
    note: '增加安全冷却、废液处置和现场恢复。', author: '王颖',
    steps: clone(baseSteps).map((step) => sealStep(step, '2026-09-24T15:10:00+08:00'))
  };

  return {
    id: 'exp-catalyst-2026-09', schemaVersion: SCHEMA_VERSION, title: '负载型催化剂评价实验', code: 'SAFE-CAT-026',
    objective: '在受控温度下评价催化剂活性，并完整记录过程样品与安全控制措施。',
    principal: '李明', lab: '材料化学实验室 B-207',
    status: 'in-review', version: '1.2.0-draft',
    steps: baseSteps, versions: [firstVersion, secondVersion], updatedAt: new Date().toISOString()
  };
}

function historyReducer(state: HistoryState, action:
  | { type: 'commit'; update: (draft: ExperimentProcess) => void }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: ExperimentProcess }
): HistoryState {
  if (action.type === 'commit') {
    const next = clone(state.present);
    action.update(next);
    next.updatedAt = new Date().toISOString();
    return { past: [...state.past.slice(-59), clone(state.present)], present: next, future: [] };
  }
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    if (!previous) return state;
    return { past: state.past.slice(0, -1), present: previous, future: [clone(state.present), ...state.future].slice(0, 60) };
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    if (!next) return state;
    return { past: [...state.past, clone(state.present)].slice(-60), present: next, future: state.future.slice(1) };
  }
  return { past: [], present: action.value, future: [] };
}

/** 旧版步骤（hazards: string[] + controls: 整段文本）迁移为逐项危险项，整段控制措施挂到第一项。 */
function migrateStep(raw: Partial<ProcessStep> & { hazards?: string[]; controls?: string }): ProcessStep {
  if (Array.isArray(raw.hazardItems)) return raw as ProcessStep;
  const legacyNames = Array.isArray(raw.hazards) ? raw.hazards : [];
  const legacyControls = typeof raw.controls === 'string' ? raw.controls.trim() : '';
  // 确定性 ID：保证同一批历史快照之间、以及快照与当前稿逐项可匹配（版本比较按 ID 对齐）。
  const hazardItems: HazardItem[] = legacyNames.map((name, index) => ({
    id: `${raw.id ?? 'step'}__hazard-${index}`,
    name,
    control: index === 0 ? legacyControls : '',
    residualRisk: '',
    signoff: null
  }));
  const { hazards: _hazards, controls: _controls, ...rest } = raw;
  return { ...(rest as ProcessStep), hazardItems };
}

/** 迁移当前流程与全部历史快照，保证撤销、自动保存与版本比较都基于同一套逐项结构。 */
function migrateProcess(parsed: Record<string, unknown>): ExperimentProcess {
  const result = parsed as unknown as ExperimentProcess;
  result.schemaVersion = SCHEMA_VERSION;
  result.steps = (result.steps ?? []).map((step) => migrateStep(step as ProcessStep));
  result.versions = (result.versions ?? []).map((version) => ({
    ...version,
    steps: version.steps.map((step) => migrateStep(step as ProcessStep))
  }));
  return result;
}

function loadProcess(): ExperimentProcess {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return initialProcess();
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed.id && Array.isArray(parsed.steps) ? migrateProcess(parsed) : initialProcess();
  } catch {
    return initialProcess();
  }
}

function statusLabel(status: StepStatus): string {
  return status === 'confirmed' ? '已确认' : status === 'returned' ? '已退回' : status === 'submitted' ? '待复核' : '草稿';
}

function processStatusLabel(status: ProcessStatus): string {
  return status === 'frozen' ? '已冻结' : status === 'in-review' ? '复核中' : status === 'revising' ? '修订中' : '草稿';
}

function signoffLabel(conclusion: SignoffConclusion | null | undefined): string {
  return conclusion === 'pass' ? '复核通过' : conclusion === 'reject' ? '复核退回' : '未签署';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

function namedHazards(step: ProcessStep): HazardItem[] {
  return step.hazardItems.filter((hazard) => hazard.name.trim().length > 0);
}

/** 步骤级安全信息缺口：有命名危险项但缺控制措施，或整步缺安全说明。 */
function hasMissingSafety(step: ProcessStep): boolean {
  const hazards = namedHazards(step);
  if (!hazards.length) return false;
  return hazards.some((hazard) => !hazard.control.trim()) || !step.safetyNote.trim();
}

/** 逐项门控：缺控制措施、尚未签署或签署结论为退回。 */
function hazardBlockers(step: ProcessStep): HazardBlocker[] {
  return namedHazards(step).flatMap((hazard) => {
    if (!hazard.control.trim()) {
      return [{ hazardId: hazard.id, hazardName: hazard.name.trim(), reason: '缺少控制措施' }];
    }
    if (!hazard.signoff) {
      return [{ hazardId: hazard.id, hazardName: hazard.name.trim(), reason: '尚未复核签署' }];
    }
    if (hazard.signoff.conclusion === 'reject') {
      return [{ hazardId: hazard.id, hazardName: hazard.name.trim(), reason: '复核结论为退回，需修订后重新签署' }];
    }
    return [];
  });
}

function collectFreezeBlockers(steps: ProcessStep[]): FreezeBlocker[] {
  return steps.flatMap((step) => {
    const hazards = hazardBlockers(step);
    const safetyNoteMissing = namedHazards(step).length > 0 && !step.safetyNote.trim();
    const stepNotConfirmed = step.status !== 'confirmed';
    if (!stepNotConfirmed && !safetyNoteMissing && hazards.length === 0) return [];
    return [{ stepId: step.id, stepTitle: step.title, stepNotConfirmed, safetyNoteMissing, hazards }];
  });
}

function collectDownstream(steps: ProcessStep[], sourceId: string | null): string[] {
  if (!sourceId) return [];
  const result = new Set<string>();
  const visit = (id: string) => {
    steps.filter((step) => step.dependencies.includes(id)).forEach((step) => {
      if (result.has(step.id)) return;
      result.add(step.id);
      visit(step.id);
    });
  };
  visit(sourceId);
  return [...result];
}

function nextMinorVersion(value: string): string {
  const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return '1.2.0';
  return `${match[1]}.${Number(match[2]) + 1}.0`;
}

function summarizeHazardChanges(before: HazardItem[], after: HazardItem[]): string[] {
  const notes: string[] = [];
  const beforeMap = new Map(before.map((hazard) => [hazard.id, hazard]));
  const afterMap = new Map(after.map((hazard) => [hazard.id, hazard]));
  before.forEach((hazard) => {
    if (!afterMap.has(hazard.id) && hazard.name.trim()) notes.push(`删除危险项「${hazard.name.trim()}」`);
  });
  after.forEach((hazard) => {
    const old = beforeMap.get(hazard.id);
    if (!old) {
      notes.push(`新增危险项「${hazard.name.trim() || '未命名'}」`);
      return;
    }
    const label = hazard.name.trim() || '未命名';
    if (old.name !== hazard.name) notes.push(`危险项「${old.name.trim() || '未命名'}」改名为「${label}」`);
    if (old.control !== hazard.control) notes.push(`「${label}」控制措施修改`);
    if (old.residualRisk !== hazard.residualRisk) notes.push(`「${label}」残余风险修改`);
    if ((old.signoff?.conclusion ?? null) !== (hazard.signoff?.conclusion ?? null)) {
      notes.push(`「${label}」签署：${signoffLabel(old.signoff?.conclusion)} → ${signoffLabel(hazard.signoff?.conclusion)}`);
    }
  });
  return notes;
}

function compareVersions(process: ExperimentProcess, baseId: string, targetId: string): DiffItem[] {
  const base = process.versions.find((version) => version.id === baseId);
  const target = process.versions.find((version) => version.id === targetId);
  if (!base || !target) return [];
  const diffs: DiffItem[] = [];
  const targetMap = new Map(target.steps.map((step) => [step.id, step]));
  const baseMap = new Map(base.steps.map((step) => [step.id, step]));
  base.steps.forEach((step) => {
    if (!targetMap.has(step.id)) diffs.push({ id: step.id, title: step.title, kind: 'removed', detail: '目标版本已删除该步骤。' });
  });
  target.steps.forEach((step) => {
    const before = baseMap.get(step.id);
    if (!before) {
      const names = namedHazards(step).map((hazard) => hazard.name.trim()).join('、');
      const signed = namedHazards(step).filter((hazard) => hazard.signoff?.conclusion === 'pass').length;
      diffs.push({
        id: step.id, title: step.title, kind: 'added',
        detail: `${step.duration} 分钟；危险项：${names || '无'}；逐项签署 ${signed}/${namedHazards(step).length}`
      });
      return;
    }
    const fields: string[] = [];
    if (before.title !== step.title) fields.push('名称');
    if (before.purpose !== step.purpose) fields.push('目的');
    if (before.materials !== step.materials || before.amount !== step.amount) fields.push('材料或用量');
    if (before.equipment !== step.equipment) fields.push('设备');
    if (before.duration !== step.duration) fields.push('预计时间');
    if (before.safetyNote !== step.safetyNote) fields.push('安全说明');
    if (JSON.stringify(before.dependencies) !== JSON.stringify(step.dependencies)) fields.push('依赖关系');
    if (before.expectedResult !== step.expectedResult) fields.push('预期结果');
    const hazardNotes = summarizeHazardChanges(before.hazardItems, step.hazardItems);
    if (hazardNotes.length) fields.push('危险项管控');
    if (fields.length) {
      diffs.push({
        id: step.id, title: step.title, kind: 'changed',
        detail: `变化字段：${fields.join('、')}。${hazardNotes.length ? `${hazardNotes.join('；')}。` : ''}`
      });
    }
  });
  return diffs;
}

function SignoffTag({ hazard, large }: { hazard: HazardItem; large?: boolean }) {
  if (!hazard.signoff) return <Tag minimal icon="circle" large={large}>未复核</Tag>;
  const { conclusion, author, signedAt } = hazard.signoff;
  return (
    <Tag intent={conclusion === 'pass' ? 'success' : 'danger'} icon={conclusion === 'pass' ? 'tick-circle' : 'cross-circle'} large={large}>
      {conclusion === 'pass' ? '复核通过' : '复核退回'} · {author} · {formatDate(signedAt)}
    </Tag>
  );
}

function FreezeBlockerList({ blockers, onSelectStep }: { blockers: FreezeBlocker[]; onSelectStep?: (stepId: string) => void }) {
  if (!blockers.length) return null;
  return (
    <div className="freeze-blockers">
      {blockers.map((blocker) => (
        <div className="blocker-step" key={blocker.stepId}>
          {onSelectStep ? (
            <button onClick={() => onSelectStep(blocker.stepId)}>
              <Icon icon="warning-sign" intent="warning" size={12} />
              <strong>{blocker.stepTitle}</strong>
              <Icon icon="chevron-right" size={11} />
            </button>
          ) : (
            <span className="blocker-title"><Icon icon="warning-sign" intent="warning" size={12} /><strong>{blocker.stepTitle}</strong></span>
          )}
          <ul>
            {blocker.stepNotConfirmed && <li>步骤尚未确认</li>}
            {blocker.safetyNoteMissing && <li>缺少安全说明</li>}
            {blocker.hazards.map((hazard) => (
              <li key={hazard.hazardId}>危险项「{hazard.hazardName}」：{hazard.reason}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [history, dispatch] = useReducer(historyReducer, undefined, () => ({ past: [], present: loadProcess(), future: [] }));
  const process = history.present;
  const [selectedStepId, setSelectedStepId] = useState(process.steps[0]?.id ?? '');
  const [activeView, setActiveView] = useState<ViewId>('editor');
  const [lastModifiedId, setLastModifiedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const [savedLabel, setSavedLabel] = useState('本地数据已载入');
  const [online, setOnline] = useState(true);
  const [compareBaseId, setCompareBaseId] = useState(process.versions[0]?.id ?? '');
  const [compareTargetId, setCompareTargetId] = useState(process.versions.at(-1)?.id ?? '');
  const initialSaveSkipped = useRef(false);

  const selectedStep = process.steps.find((step) => step.id === selectedStepId) ?? process.steps[0];
  const downstreamIds = useMemo(() => collectDownstream(process.steps, lastModifiedId), [process.steps, lastModifiedId]);
  const impactedSteps = process.steps.filter((step) => downstreamIds.includes(step.id));
  const missingSafetySteps = process.steps.filter(hasMissingSafety);
  const pendingReviewCount = process.steps.filter((step) => step.status === 'submitted' || step.status === 'returned').length;
  const confirmedCount = process.steps.filter((step) => step.status === 'confirmed').length;
  const unsignedHazardCount = process.steps.reduce(
    (sum, step) => sum + namedHazards(step).filter((hazard) => !hazard.signoff || hazard.signoff.conclusion !== 'pass').length,
    0
  );
  const reviewProgress = process.steps.length ? Math.round((confirmedCount / process.steps.length) * 100) : 0;
  const freezeBlockers = useMemo(() => collectFreezeBlockers(process.steps), [process.steps]);
  const selectedHazardBlockers = selectedStep ? hazardBlockers(selectedStep) : [];
  const selectedSafetyNoteMissing = selectedStep ? namedHazards(selectedStep).length > 0 && !selectedStep.safetyNote.trim() : false;
  const versionDiff = useMemo(() => compareVersions(process, compareBaseId, compareTargetId), [process, compareBaseId, compareTargetId]);

  useEffect(() => {
    if (!initialSaveSkipped.current) {
      initialSaveSkipped.current = true;
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(process));
    setSavedLabel(`自动保存 · ${formatDate(new Date().toISOString())}`);
  }, [process]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? dispatch({ type: 'redo' }) : dispatch({ type: 'undo' });
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        dispatch({ type: 'redo' });
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(process));
        setSavedLabel(`手动保存 · ${formatDate(new Date().toISOString())}`);
      }
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [process]);

  const commitProcess = (update: (draft: ExperimentProcess) => void): void => {
    dispatch({ type: 'commit', update });
  };

  const updateProcessField = (field: 'title' | 'code' | 'objective' | 'principal' | 'lab', value: string): void => {
    commitProcess((draft) => { draft[field] = value; });
  };

  const updateStep = (field: keyof ProcessStep, value: unknown): void => {
    if (!selectedStep) return;
    const id = selectedStep.id;
    setLastModifiedId(id);
    commitProcess((draft) => {
      const step = draft.steps.find((item) => item.id === id);
      if (step) (step as unknown as Record<string, unknown>)[field] = value;
    });
  };

  const addStep = (): void => {
    if (process.status === 'frozen') return;
    const id = uid('step');
    commitProcess((draft) => {
      draft.steps.push({
        id, title: '新的实验步骤', purpose: '', materials: '', equipment: '', amount: '', duration: 10,
        hazardItems: [], dependencies: draft.steps.at(-1) ? [draft.steps.at(-1)!.id] : [],
        safetyNote: '', expectedResult: '', status: 'draft', comments: []
      });
      draft.status = 'draft';
    });
    setSelectedStepId(id);
    setLastModifiedId(id);
    setActiveView('editor');
  };

  const duplicateStep = (): void => {
    if (!selectedStep || process.status === 'frozen') return;
    const copy: ProcessStep = clone(selectedStep);
    copy.id = uid('step');
    copy.title = `${copy.title}（副本）`;
    copy.status = 'draft';
    copy.comments = [];
    copy.dependencies = [...copy.dependencies];
    // 副本中的危险项重新编号，且不携带原签署结论，需要重新复核。
    copy.hazardItems = copy.hazardItems.map((hazard) => ({ ...hazard, id: uid('hazard'), signoff: null }));
    commitProcess((draft) => {
      const index = draft.steps.findIndex((step) => step.id === selectedStep.id);
      draft.steps.splice(index + 1, 0, copy);
    });
    setSelectedStepId(copy.id);
  };

  const deleteStep = (): void => {
    if (!selectedStep || process.steps.length <= 1 || process.status === 'frozen') return;
    const id = selectedStep.id;
    commitProcess((draft) => {
      draft.steps = draft.steps.filter((step) => step.id !== id);
      draft.steps.forEach((step) => { step.dependencies = step.dependencies.filter((dependency) => dependency !== id); });
    });
    setSelectedStepId(process.steps.find((step) => step.id !== id)?.id ?? '');
  };

  const moveStep = (direction: -1 | 1): void => {
    if (!selectedStep || process.status === 'frozen') return;
    const id = selectedStep.id;
    commitProcess((draft) => {
      const index = draft.steps.findIndex((step) => step.id === id);
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= draft.steps.length) return;
      const [step] = draft.steps.splice(index, 1);
      draft.steps.splice(nextIndex, 0, step);
    });
    setLastModifiedId(id);
  };

  const toggleDependency = (dependencyId: string, checked: boolean): void => {
    if (!selectedStep) return;
    const next = checked
      ? [...new Set([...selectedStep.dependencies, dependencyId])]
      : selectedStep.dependencies.filter((id) => id !== dependencyId);
    updateStep('dependencies', next);
  };

  const addHazard = (): void => {
    if (!selectedStep || process.status === 'frozen') return;
    const stepId = selectedStep.id;
    setLastModifiedId(stepId);
    commitProcess((draft) => {
      const step = draft.steps.find((item) => item.id === stepId);
      step?.hazardItems.push(makeHazard());
    });
  };

  const removeHazard = (hazardId: string): void => {
    if (!selectedStep || process.status === 'frozen') return;
    const stepId = selectedStep.id;
    setLastModifiedId(stepId);
    commitProcess((draft) => {
      const step = draft.steps.find((item) => item.id === stepId);
      if (step) step.hazardItems = step.hazardItems.filter((hazard) => hazard.id !== hazardId);
    });
  };

  /** 改写危险项名称：该项原有控制措施与签署立即失效（残余风险保留），已确认步骤降为待复核。 */
  const renameHazard = (hazardId: string, value: string): void => {
    if (!selectedStep || process.status === 'frozen') return;
    const stepId = selectedStep.id;
    setLastModifiedId(stepId);
    commitProcess((draft) => {
      const step = draft.steps.find((item) => item.id === stepId);
      const hazard = step?.hazardItems.find((item) => item.id === hazardId);
      if (!step || !hazard) return;
      hazard.name = value;
      hazard.control = '';
      hazard.signoff = null;
      if (step.status === 'confirmed') step.status = 'submitted';
    });
  };

  /** 编辑控制措施或残余风险：原签署立即失效，已确认步骤降为待复核。 */
  const updateHazardField = (hazardId: string, field: HazardField, value: string): void => {
    if (!selectedStep || process.status === 'frozen') return;
    const stepId = selectedStep.id;
    setLastModifiedId(stepId);
    commitProcess((draft) => {
      const step = draft.steps.find((item) => item.id === stepId);
      const hazard = step?.hazardItems.find((item) => item.id === hazardId);
      if (!step || !hazard) return;
      hazard[field] = value;
      if (hazard.signoff) {
        hazard.signoff = null;
        if (step.status === 'confirmed') step.status = 'submitted';
      }
    });
  };

  const signHazard = (hazardId: string, conclusion: SignoffConclusion): void => {
    if (!selectedStep || process.status === 'frozen') return;
    const stepId = selectedStep.id;
    commitProcess((draft) => {
      const step = draft.steps.find((item) => item.id === stepId);
      const hazard = step?.hazardItems.find((item) => item.id === hazardId);
      if (!hazard || !hazard.name.trim() || !hazard.control.trim()) return;
      hazard.signoff = { author: CURRENT_AUTHOR, role: CURRENT_ROLE, conclusion, signedAt: new Date().toISOString() };
    });
  };

  const clearHazardSignoff = (hazardId: string): void => {
    if (!selectedStep || process.status === 'frozen') return;
    const stepId = selectedStep.id;
    commitProcess((draft) => {
      const step = draft.steps.find((item) => item.id === stepId);
      const hazard = step?.hazardItems.find((item) => item.id === hazardId);
      if (!step || !hazard) return;
      hazard.signoff = null;
      if (step.status === 'confirmed') step.status = 'submitted';
    });
  };

  const submitForReview = (): void => {
    if (process.status === 'frozen') return;
    commitProcess((draft) => {
      draft.status = 'in-review';
      draft.steps.forEach((step) => {
        if (step.status !== 'confirmed') step.status = 'submitted';
      });
    });
    setActiveView('review');
    setSavedLabel('流程已提交复核');
  };

  const addReviewComment = (): void => {
    if (!selectedStep || !commentText.trim()) return;
    const id = selectedStep.id;
    commitProcess((draft) => {
      const step = draft.steps.find((item) => item.id === id);
      step?.comments.push({
        id: uid('comment'), author: CURRENT_AUTHOR, role: CURRENT_ROLE,
        text: commentText.trim(), createdAt: new Date().toISOString(), resolved: false
      });
    });
    setCommentText('');
  };

  const setStepStatus = (status: StepStatus): void => {
    if (!selectedStep) return;
    updateStep('status', status);
    setLastModifiedId(status === 'returned' ? selectedStep.id : null);
  };

  const resolveComment = (commentId: string): void => {
    if (!selectedStep) return;
    const stepId = selectedStep.id;
    commitProcess((draft) => {
      const comment = draft.steps.find((step) => step.id === stepId)?.comments.find((item) => item.id === commentId);
      if (comment) comment.resolved = !comment.resolved;
    });
  };

  const freezeVersion = (): void => {
    if (process.status === 'frozen') return;
    if (freezeBlockers.length) {
      setSavedLabel(`冻结被拦截：${freezeBlockers.length} 个步骤仍有缺口`);
      return;
    }
    const nextNumber = nextMinorVersion(process.version);
    const previousVersionId = process.versions.at(-1)?.id ?? '';
    const frozenVersionId = uid('version');
    commitProcess((draft) => {
      draft.versions.push({
        id: frozenVersionId, label: '复核通过冻结版', version: nextNumber,
        createdAt: new Date().toISOString(),
        note: `${draft.steps.length} 个步骤全部确认，${draft.steps.reduce((sum, step) => sum + namedHazards(step).length, 0)} 项危险项逐项签署通过。`,
        author: CURRENT_AUTHOR, steps: clone(draft.steps)
      });
      draft.version = nextNumber;
      draft.status = 'frozen';
      draft.frozenAt = new Date().toISOString();
    });
    setSavedLabel(`版本 ${nextNumber} 已冻结`);
    setCompareBaseId(previousVersionId);
    setCompareTargetId(frozenVersionId);
  };

  const startRevision = (): void => {
    if (process.status !== 'frozen') return;
    commitProcess((draft) => {
      const nextNumber = nextMinorVersion(draft.version);
      draft.version = `${nextNumber}-revision`;
      draft.status = 'revising';
      draft.frozenAt = undefined;
      draft.steps.forEach((step) => {
        step.status = 'draft';
        step.comments = [];
        step.hazardItems.forEach((hazard) => { hazard.signoff = null; });
      });
    });
    setActiveView('editor');
    setSavedLabel('已从冻结版本创建修订稿');
  };

  const addVersionSnapshot = (): void => {
    commitProcess((draft) => {
      draft.versions.push({
        id: uid('version'), label: '工作版本快照', version: draft.version.replace('-draft', ''),
        createdAt: new Date().toISOString(),
        note: `保存当前步骤与逐项签署状态（${namedHazardsAll(draft.steps)} 项危险项）。`,
        author: CURRENT_AUTHOR, steps: clone(draft.steps)
      });
    });
    setSavedLabel('已保存工作版本快照');
  };

  const selectStepAndView = (stepId: string, view: ViewId): void => {
    setSelectedStepId(stepId);
    setActiveView(view);
  };

  const confirmDisabled = process.status === 'frozen' || selectedSafetyNoteMissing || selectedHazardBlockers.length > 0;
  const freezeDisabled = process.status === 'frozen' || freezeBlockers.length > 0;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-icon"><Icon icon="lab-test" size={23} /></div>
          <div><h1>实验流程安全复核台</h1><p>步骤影响分析 · 危险项逐项管控与签署 · 冻结版本</p></div>
        </div>
        <div className="header-status">
          <span className={`network ${online ? 'online' : ''}`}></span>
          <span>{online ? '离线保存已启用' : '当前离线，修改仍会保存'}</span>
          <strong>{savedLabel}</strong>
        </div>
        <div className="header-actions">
          <Button icon="undo" text="撤销" minimal disabled={history.past.length === 0} onClick={() => dispatch({ type: 'undo' })} />
          <Button icon="redo" text="重做" minimal disabled={history.future.length === 0} onClick={() => dispatch({ type: 'redo' })} />
          <Button icon="floppy-disk" text="保存快照" onClick={addVersionSnapshot} />
          <Button
            icon="lock" text="冻结版本" intent="primary" onClick={freezeVersion} disabled={freezeDisabled}
            title={freezeBlockers.length ? `仍有 ${freezeBlockers.length} 个步骤未满足逐项签署等冻结条件` : undefined}
          />
        </div>
      </header>

      {!online && <Callout className="offline-callout" intent="warning" icon="cloud">网络不可用。编辑、复核和版本快照仍会保存在当前浏览器。</Callout>}

      <section className="process-banner">
        <div className="banner-main">
          <div className="code-line"><span>{process.code}</span><Tag minimal>{processStatusLabel(process.status)}</Tag></div>
          <h2>{process.title}</h2>
          <p>{process.objective}</p>
        </div>
        <div className="banner-meta">
          <div><span>负责人</span><strong>{process.principal}</strong></div>
          <div><span>实验区域</span><strong>{process.lab}</strong></div>
          <div><span>当前版本</span><strong>{process.version}</strong></div>
        </div>
        <div className="banner-progress">
          <div><span>复核进度</span><strong>{confirmedCount}/{process.steps.length}</strong></div>
          <ProgressBar value={reviewProgress / 100} intent={reviewProgress === 100 ? 'success' : 'primary'} stripes={reviewProgress < 100} />
          <small>{pendingReviewCount ? `${pendingReviewCount} 条待处理` : '所有步骤已处理'} · {missingSafetySteps.length} 条安全缺口 · {unsignedHazardCount} 项危险项待签署</small>
        </div>
      </section>

      <Tabs id="workspace-tabs" selectedTabId={activeView} onChange={(value) => setActiveView(value as ViewId)} renderActiveTabPanelOnly className="workspace-tabs">
        <Tab id="editor" title={<span><Icon icon="edit" /> 流程编写</span>} />
        <Tab id="review" title={<span><Icon icon="endorsed" /> 安全复核 {pendingReviewCount > 0 && <b className="tab-badge">{pendingReviewCount}</b>}</span>} />
        <Tab id="compare" title={<span><Icon icon="comparison" /> 版本比较</span>} />
      </Tabs>

      {activeView === 'editor' && selectedStep && (
        <main className="editor-layout">
          <aside className="step-panel">
            <div className="panel-heading">
              <div><span>PROCESS STEPS</span><h3>实验步骤</h3></div>
              <Button icon="add" minimal small onClick={addStep} disabled={process.status === 'frozen'} />
            </div>
            <div className="step-list">
              {process.steps.map((step, index) => (
                <button key={step.id} className={step.id === selectedStep.id ? 'selected' : ''} onClick={() => setSelectedStepId(step.id)}>
                  <span className={`step-number ${step.status}`}>{String(index + 1).padStart(2, '0')}</span>
                  <span className="step-copy">
                    <strong>{step.title}</strong>
                    <small>
                      {step.duration} 分钟 · {statusLabel(step.status)}
                      {hazardBlockers(step).length > 0 && <em className="block-badge"> {hazardBlockers(step).length} 项待办</em>}
                    </small>
                  </span>
                  {hasMissingSafety(step) && <Icon icon="warning-sign" intent="danger" size={13} />}
                </button>
              ))}
            </div>
            <div className="step-actions">
              <Button icon="arrow-up" small minimal disabled={process.steps[0]?.id === selectedStep.id || process.status === 'frozen'} onClick={() => moveStep(-1)} />
              <Button icon="arrow-down" small minimal disabled={process.steps.at(-1)?.id === selectedStep.id || process.status === 'frozen'} onClick={() => moveStep(1)} />
              <Button icon="duplicate" small minimal text="复制" disabled={process.status === 'frozen'} onClick={duplicateStep} />
              <Button icon="trash" small minimal intent="danger" disabled={process.status === 'frozen'} onClick={deleteStep} />
            </div>
          </aside>

          <section className="editor-main">
            <Card elevation={Elevation.ONE} className="process-meta-card">
              <div className="card-title"><div><span>PROCESS INFO</span><h3>实验基本信息</h3></div><Tag minimal intent="primary">{process.steps.length} 个步骤</Tag></div>
              <div className="meta-grid">
                <FormGroup label="实验名称" labelFor="process-title"><InputGroup id="process-title" fill value={process.title} onChange={(event) => updateProcessField('title', event.target.value)} /></FormGroup>
                <FormGroup label="流程编号" labelFor="process-code"><InputGroup id="process-code" fill value={process.code} onChange={(event) => updateProcessField('code', event.target.value)} /></FormGroup>
                <FormGroup label="负责人" labelFor="principal"><InputGroup id="principal" fill value={process.principal} onChange={(event) => updateProcessField('principal', event.target.value)} /></FormGroup>
                <FormGroup label="实验区域" labelFor="lab"><InputGroup id="lab" fill value={process.lab} onChange={(event) => updateProcessField('lab', event.target.value)} /></FormGroup>
              </div>
              <FormGroup label="实验目标" labelFor="objective"><TextArea id="objective" fill value={process.objective} onChange={(event) => updateProcessField('objective', event.target.value)} /></FormGroup>
            </Card>

            <Card elevation={Elevation.ONE} className="step-editor-card">
              <div className="card-title">
                <div><span>STEP {String(process.steps.indexOf(selectedStep) + 1).padStart(2, '0')}</span><h3>{selectedStep.title}</h3></div>
                <Tag minimal intent={selectedStep.status === 'confirmed' ? 'success' : selectedStep.status === 'returned' ? 'danger' : 'warning'}>{statusLabel(selectedStep.status)}</Tag>
              </div>
              <FormGroup label="步骤名称" labelFor="step-title"><InputGroup id="step-title" fill value={selectedStep.title} onChange={(event) => updateStep('title', event.target.value)} /></FormGroup>
              <FormGroup label="操作目的" labelFor="step-purpose"><TextArea id="step-purpose" fill value={selectedStep.purpose} onChange={(event) => updateStep('purpose', event.target.value)} /></FormGroup>
              <div className="form-grid">
                <FormGroup label="材料" labelFor="materials"><TextArea id="materials" fill value={selectedStep.materials} onChange={(event) => updateStep('materials', event.target.value)} /></FormGroup>
                <FormGroup label="设备" labelFor="equipment"><TextArea id="equipment" fill value={selectedStep.equipment} onChange={(event) => updateStep('equipment', event.target.value)} /></FormGroup>
                <FormGroup label="用量 / 参数" labelFor="amount"><TextArea id="amount" fill value={selectedStep.amount} onChange={(event) => updateStep('amount', event.target.value)} /></FormGroup>
                <FormGroup label="预计时间（分钟）" labelFor="duration"><InputGroup id="duration" type="number" min={1} fill value={String(selectedStep.duration)} onChange={(event) => updateStep('duration', Number(event.target.value))} /></FormGroup>
              </div>

              <div className="hazards-block">
                <div className="hazards-toolbar">
                  <label className="bp6-label">危险项 · 控制措施 · 残余风险（逐项对应）</label>
                  <Button icon="add" small text="添加危险项" onClick={addHazard} disabled={process.status === 'frozen'} />
                </div>
                <p className="muted">每项危险项独立维护控制措施、残余风险并由复核人分别签署。<strong className="danger-text">改写危险项名称后，该项原有控制措施与签署立即失效</strong>，需重新填写并复核；编辑控制措施或残余风险也会使原签署失效。</p>
                {selectedStep.hazardItems.map((hazard, index) => {
                  const named = hazard.name.trim().length > 0;
                  const controlMissing = named && !hazard.control.trim();
                  return (
                    <div className={`hazard-row ${controlMissing ? 'invalid' : ''}`} key={hazard.id}>
                      <div className="hazard-name-line">
                        <Tag minimal intent="warning">危险项 {index + 1}</Tag>
                        <InputGroup
                          aria-label={`危险项 ${index + 1} 名称`}
                          placeholder="危险项名称，如：易燃液体（改写会清空该项控制与签署）"
                          value={hazard.name}
                          disabled={process.status === 'frozen'}
                          onChange={(event) => renameHazard(hazard.id, event.target.value)}
                        />
                        <Button icon="trash" minimal small intent="danger" title="删除该危险项" disabled={process.status === 'frozen'} onClick={() => removeHazard(hazard.id)} />
                      </div>
                      <div className="hazard-fields">
                        <FormGroup label="控制措施（逐项必填）" labelFor={`control-${hazard.id}`} intent={controlMissing ? 'danger' : 'none'} helperText={controlMissing ? '该危险项缺少控制措施，步骤不能确认。' : undefined}>
                          <TextArea
                            id={`control-${hazard.id}`}
                            className="hazard-textarea"
                            fill
                            intent={controlMissing ? 'danger' : 'none'}
                            placeholder="针对该危险项的工程 / 管理 / 个体防护措施"
                            value={hazard.control}
                            disabled={process.status === 'frozen'}
                            onChange={(event) => updateHazardField(hazard.id, 'control', event.target.value)}
                          />
                        </FormGroup>
                        <FormGroup label="残余风险（控制后的剩余风险）" labelFor={`residual-${hazard.id}`}>
                          <TextArea
                            id={`residual-${hazard.id}`}
                            className="hazard-textarea"
                            fill
                            placeholder="采取上述控制措施后仍残留的风险及兜底安排"
                            value={hazard.residualRisk}
                            disabled={process.status === 'frozen'}
                            onChange={(event) => updateHazardField(hazard.id, 'residualRisk', event.target.value)}
                          />
                        </FormGroup>
                      </div>
                      <div className="hazard-signoff">
                        <SignoffTag hazard={hazard} />
                        {hazard.signoff && <small>编辑本项内容后签署将自动撤销</small>}
                      </div>
                    </div>
                  );
                })}
                {!selectedStep.hazardItems.length && (
                  <p className="muted">暂无危险项。存在危险项时必须逐项填写控制措施，并由复核人逐项签署后才能确认步骤、冻结版本。</p>
                )}
              </div>

              <FormGroup
                label="安全说明"
                labelFor="safety-note"
                intent={selectedSafetyNoteMissing ? 'danger' : 'none'}
                helperText={selectedSafetyNoteMissing ? '存在危险项时安全说明为必填。' : namedHazards(selectedStep).length ? '安全说明已满足复核条件。' : undefined}
              >
                <TextArea id="safety-note" fill intent={selectedSafetyNoteMissing ? 'danger' : 'none'} value={selectedStep.safetyNote} onChange={(event) => updateStep('safetyNote', event.target.value)} />
              </FormGroup>
              <FormGroup label="预期结果" labelFor="expected"><TextArea id="expected" fill value={selectedStep.expectedResult} onChange={(event) => updateStep('expectedResult', event.target.value)} /></FormGroup>
            </Card>

            <Card elevation={Elevation.ONE} className="dependency-card">
              <div className="card-title"><div><span>DEPENDENCIES</span><h3>前置步骤</h3></div><Tag minimal>{selectedStep.dependencies.length} 个依赖</Tag></div>
              <p className="muted">当前步骤只有在所选前置步骤完成后才能进入执行队列。</p>
              <div className="dependency-grid">
                {process.steps.filter((step) => step.id !== selectedStep.id).map((step) => (
                  <Checkbox key={step.id} checked={selectedStep.dependencies.includes(step.id)} label={`${String(process.steps.indexOf(step) + 1).padStart(2, '0')} · ${step.title}`} onChange={(event) => toggleDependency(step.id, event.currentTarget.checked)} />
                ))}
              </div>
            </Card>
          </section>

          <aside className="inspector-panel">
            <Card elevation={Elevation.ONE} className="impact-card">
              <div className="card-title"><div><span>IMPACT ANALYSIS</span><h3>变更影响提醒</h3></div><Icon icon="path-search" size={18} /></div>
              {lastModifiedId ? (
                <>
                  <Callout intent={impactedSteps.length ? 'warning' : 'primary'} icon={impactedSteps.length ? 'warning-sign' : 'tick'}>
                    <strong>{impactedSteps.length ? `${impactedSteps.length} 个后续步骤受影响` : '未发现下游步骤'}</strong>
                    <p>{impactedSteps.length ? '请重新核对依赖、用量、危险项和已确认内容。' : '当前修改没有影响其他步骤的安全条件。'}</p>
                  </Callout>
                  <div className="impact-list">
                    {impactedSteps.map((step) => (
                      <button key={step.id} onClick={() => setSelectedStepId(step.id)}>
                        <Icon icon={step.status === 'confirmed' ? 'endorsed' : 'circle'} intent={step.status === 'confirmed' ? 'success' : 'none'} size={13} />
                        <span><strong>{step.title}</strong><small>{step.status === 'confirmed' ? '已确认内容，需重新复核' : `当前状态：${statusLabel(step.status)}`}</small></span>
                        <Icon icon="chevron-right" size={12} />
                      </button>
                    ))}
                  </div>
                </>
              ) : <p className="muted">编辑任一步骤后，这里会显示受影响的所有后续步骤和已确认内容。</p>}
            </Card>

            <Card elevation={Elevation.ONE} className="safety-card">
              <div className="card-title"><div><span>SAFETY GATE</span><h3>安全完整性</h3></div><Tag intent={missingSafetySteps.length ? 'danger' : 'success'} minimal>{missingSafetySteps.length ? `${missingSafetySteps.length} 项缺口` : '通过'}</Tag></div>
              {missingSafetySteps.length ? missingSafetySteps.map((step) => {
                const missingControlNames = namedHazards(step).filter((hazard) => !hazard.control.trim()).map((hazard) => hazard.name.trim());
                return (
                  <button className="safety-row" key={step.id} onClick={() => setSelectedStepId(step.id)}>
                    <Icon icon="warning-sign" intent="danger" size={14} />
                    <span>
                      <strong>{step.title}</strong>
                      <small>
                        {!step.safetyNote.trim() && '缺少安全说明；'}
                        {missingControlNames.length ? `危险项缺控制措施：${missingControlNames.join('、')}` : ''}
                      </small>
                    </span>
                  </button>
                );
              }) : <p className="muted">所有存在危险项的步骤都已填写控制措施和安全说明。</p>}
            </Card>

            <Card elevation={Elevation.ONE} className="gate-card">
              <div className="card-title"><div><span>RELEASE GATE</span><h3>提交与冻结</h3></div><Tag intent={freezeBlockers.length ? 'warning' : 'success'} minimal>{freezeBlockers.length ? `${freezeBlockers.length} 步受阻` : '可冻结'}</Tag></div>
              <div className="gate-row"><span>复核状态</span><strong>{confirmedCount}/{process.steps.length}</strong></div>
              <div className="gate-row"><span>安全缺口</span><strong className={missingSafetySteps.length ? 'danger-text' : ''}>{missingSafetySteps.length}</strong></div>
              <div className="gate-row"><span>待签署 / 被退回危险项</span><strong className={unsignedHazardCount ? 'danger-text' : ''}>{unsignedHazardCount}</strong></div>
              <div className="gate-row"><span>流程状态</span><strong>{processStatusLabel(process.status)}</strong></div>
              <Divider />
              {freezeBlockers.length > 0 && (
                <>
                  <p className="muted">冻结入口被以下步骤 / 危险项卡住：</p>
                  <FreezeBlockerList blockers={freezeBlockers} onSelectStep={(stepId) => selectStepAndView(stepId, 'review')} />
                </>
              )}
              {process.status === 'frozen'
                ? <Button fill intent="warning" icon="git-branch" text="从冻结版创建修订" onClick={startRevision} />
                : <Button fill intent="primary" icon="send-to" text="提交复核" onClick={submitForReview} />}
            </Card>
          </aside>
        </main>
      )}

      {activeView === 'review' && (
        <main className="review-layout">
          <aside className="review-steps">
            <div className="panel-heading"><div><span>REVIEW QUEUE</span><h3>逐条复核</h3></div><Tag intent={pendingReviewCount ? 'warning' : 'success'}>{pendingReviewCount ? `${pendingReviewCount} 待处理` : '已完成'}</Tag></div>
            {process.steps.map((step, index) => (
              <button key={step.id} className={`${step.id === selectedStep?.id ? 'selected' : ''} ${step.status}`} onClick={() => setSelectedStepId(step.id)}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <strong>{step.title}</strong>
                  <small>
                    {statusLabel(step.status)} · {namedHazards(step).length} 项危险
                    {hazardBlockers(step).length > 0 && <em className="block-badge"> {hazardBlockers(step).length} 项卡住</em>}
                  </small>
                </div>
                <Icon icon={step.status === 'confirmed' ? 'tick-circle' : step.status === 'returned' ? 'undo' : 'circle'} size={15} />
              </button>
            ))}
          </aside>
          <section className="review-main">
            {selectedStep && (
              <>
                <Card elevation={Elevation.ONE} className="review-summary">
                  <div className="card-title"><div><span>SAFETY REVIEW</span><h3>{selectedStep.title}</h3></div><Tag intent={selectedStep.status === 'confirmed' ? 'success' : selectedStep.status === 'returned' ? 'danger' : 'warning'}>{statusLabel(selectedStep.status)}</Tag></div>
                  <div className="review-facts">
                    <div><span>预计时间</span><strong>{selectedStep.duration} 分钟</strong></div>
                    <div><span>材料与用量</span><strong>{selectedStep.materials} / {selectedStep.amount}</strong></div>
                    <div><span>危险项</span><strong>{namedHazards(selectedStep).map((hazard) => hazard.name.trim()).join('、') || '无'}</strong></div>
                  </div>

                  <div className="review-section">
                    <h4>逐项控制措施、残余风险与签署</h4>
                    {selectedStep.hazardItems.filter((hazard) => hazard.name.trim()).map((hazard) => (
                      <div className="review-hazard" key={hazard.id}>
                        <header>
                          <Tag intent="warning" icon="warning-sign">{hazard.name.trim()}</Tag>
                          <SignoffTag hazard={hazard} />
                        </header>
                        <p><strong>控制措施：</strong>{hazard.control.trim() || <em className="danger-text">未填写</em>}</p>
                        <p><strong>残余风险：</strong>{hazard.residualRisk.trim() || <em>未评估</em>}</p>
                        <div className="signoff-line">
                          <Button
                            small intent="success" icon="tick" text="签署：控制有效"
                            active={hazard.signoff?.conclusion === 'pass'}
                            disabled={process.status === 'frozen' || !hazard.control.trim()}
                            onClick={() => signHazard(hazard.id, 'pass')}
                          />
                          <Button
                            small intent="danger" icon="cross" text="签署：控制不足，退回"
                            active={hazard.signoff?.conclusion === 'reject'}
                            disabled={process.status === 'frozen' || !hazard.control.trim()}
                            onClick={() => signHazard(hazard.id, 'reject')}
                          />
                          {hazard.signoff && process.status !== 'frozen' && (
                            <Button minimal small icon="eraser" text="撤销签署" onClick={() => clearHazardSignoff(hazard.id)} />
                          )}
                        </div>
                      </div>
                    ))}
                    {!namedHazards(selectedStep).length && <p className="muted">本步骤无危险项，无需逐项签署。</p>}
                  </div>

                  <div className="review-section"><h4>安全说明</h4><p className={selectedSafetyNoteMissing ? 'danger-text' : ''}>{selectedStep.safetyNote || '未填写'}</p></div>
                  {(selectedHazardBlockers.length > 0 || selectedSafetyNoteMissing) && (
                    <Callout intent="danger" icon="warning-sign">
                      <strong>当前步骤还不能确认：</strong>
                      <ul className="inline-blockers">
                        {selectedSafetyNoteMissing && <li>缺少安全说明</li>}
                        {selectedHazardBlockers.map((blocker) => (
                          <li key={blocker.hazardId}>危险项「{blocker.hazardName}」：{blocker.reason}</li>
                        ))}
                      </ul>
                    </Callout>
                  )}
                </Card>
                <Card elevation={Elevation.ONE} className="comment-card">
                  <div className="card-title"><div><span>REVIEW COMMENTS</span><h3>复核批注</h3></div><Tag minimal>{selectedStep.comments.length} 条</Tag></div>
                  <div className="comment-compose">
                    <TextArea fill value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="填写具体依据、风险或修改建议…" />
                    <Button intent="primary" icon="comment" text="添加批注" disabled={!commentText.trim()} onClick={addReviewComment} />
                  </div>
                  <div className="comment-list">
                    {selectedStep.comments.map((comment) => (
                      <article key={comment.id} className={comment.resolved ? 'resolved' : ''}>
                        <div className="comment-avatar">{comment.author.slice(0, 1)}</div>
                        <div><header><strong>{comment.author}</strong><span>{comment.role}</span><time>{formatDate(comment.createdAt)}</time></header><p>{comment.text}</p><Button minimal small text={comment.resolved ? '已解决' : '标记解决'} icon={comment.resolved ? 'tick' : 'circle'} onClick={() => resolveComment(comment.id)} /></div>
                      </article>
                    ))}
                    {!selectedStep.comments.length && <p className="muted">当前步骤尚未添加复核批注。</p>}
                  </div>
                </Card>
              </>
            )}
          </section>
          <aside className="review-actions">
            <Card elevation={Elevation.ONE}>
              <div className="card-title"><div><span>REVIEWER ACTION</span><h3>复核决定</h3></div><Icon icon="endorsed" size={18} /></div>
              <p className="muted">先在左侧对每项危险项分别签署结论，再确认整个步骤。确认后若修改该步骤，受影响的下游步骤会在编辑页重新提示。</p>
              {selectedStep && (selectedHazardBlockers.length > 0 || selectedSafetyNoteMissing) && (
                <Callout intent="warning" icon="blocked-person" className="action-blockers">
                  <ul className="inline-blockers">
                    {selectedSafetyNoteMissing && <li>缺少安全说明</li>}
                    {selectedHazardBlockers.map((blocker) => (
                      <li key={blocker.hazardId}>「{blocker.hazardName}」：{blocker.reason}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              <Button fill large intent="success" icon="tick" text="确认本步骤" disabled={confirmDisabled} onClick={() => setStepStatus('confirmed')} />
              <Button fill large icon="undo" text="退回修改" intent="warning" onClick={() => setStepStatus('returned')} />
              <Button fill large minimal icon="refresh" text="恢复为待复核" onClick={() => setStepStatus('submitted')} />
              <Divider />
              <div className="review-progress-list">
                {process.steps.map((step) => <div key={step.id}><span>{step.title}（{namedHazards(step).filter((hazard) => hazard.signoff?.conclusion === 'pass').length}/{namedHazards(step).length} 签署）</span><Tag minimal intent={step.status === 'confirmed' ? 'success' : step.status === 'returned' ? 'danger' : 'warning'}>{statusLabel(step.status)}</Tag></div>)}
              </div>
              {freezeBlockers.length > 0 && (
                <>
                  <p className="muted">冻结仍被以下项卡住：</p>
                  <FreezeBlockerList blockers={freezeBlockers} onSelectStep={setSelectedStepId} />
                </>
              )}
              <Button fill intent="primary" icon="lock" text="全部签署确认后冻结" onClick={freezeVersion} disabled={freezeDisabled} />
            </Card>
          </aside>
        </main>
      )}

      {activeView === 'compare' && (
        <main className="compare-layout">
          <Card elevation={Elevation.ONE} className="version-panel">
            <div className="card-title"><div><span>VERSION TIMELINE</span><h3>冻结版本</h3></div><Tag minimal>{process.versions.length} 个</Tag></div>
            <div className="version-timeline">
              {process.versions.map((version, index) => (
                <article key={version.id} className={index === process.versions.length - 1 ? 'latest' : ''}>
                  <span></span><div><b>{version.version}</b><strong>{version.label}</strong><p>{formatDate(version.createdAt)} · {version.steps.length} 个步骤 · {version.author}</p><small>{version.note}</small></div>
                </article>
              ))}
            </div>
          </Card>
          <Card elevation={Elevation.ONE} className="diff-panel">
            <div className="card-title"><div><span>VERSION DIFF</span><h3>流程差异比较</h3></div><div className="diff-selects">
              <HTMLSelect value={compareBaseId} onChange={(event) => setCompareBaseId(event.target.value)}>{process.versions.map((version) => <option key={version.id} value={version.id}>{version.version} · 基准</option>)}</HTMLSelect>
              <Icon icon="arrow-right" />
              <HTMLSelect value={compareTargetId} onChange={(event) => setCompareTargetId(event.target.value)}>{process.versions.map((version) => <option key={version.id} value={version.id}>{version.version} · 目标</option>)}</HTMLSelect>
            </div></div>
            <div className="diff-table">
              <div className="diff-head"><span>变更类型</span><span>步骤</span><span>具体内容</span></div>
              {versionDiff.map((diff) => <div className={`diff-row ${diff.kind}`} key={diff.id}><Tag minimal intent={diff.kind === 'added' ? 'success' : diff.kind === 'removed' ? 'danger' : 'primary'}>{diff.kind === 'added' ? '新增' : diff.kind === 'removed' ? '删除' : '修改'}</Tag><strong>{diff.title}</strong><p>{diff.detail}</p></div>)}
              {!versionDiff.length && <div className="empty-diff"><Icon icon="comparison" size={30} /><strong>两个版本没有差异</strong><p>请选择不同版本，或先冻结新的流程版本。</p></div>}
            </div>
          </Card>
          <Card elevation={Elevation.ONE} className="freeze-rules">
            <div className="card-title"><div><span>FREEZE RULES</span><h3>冻结检查</h3></div></div>
            <div className={confirmedCount === process.steps.length ? 'passed' : ''}><Icon icon={confirmedCount === process.steps.length ? 'tick-circle' : 'circle'} /><span><strong>所有步骤已确认</strong><small>{confirmedCount}/{process.steps.length}</small></span></div>
            <div className={!missingSafetySteps.length ? 'passed' : ''}><Icon icon={!missingSafetySteps.length ? 'tick-circle' : 'circle'} /><span><strong>控制措施与安全说明完整</strong><small>{missingSafetySteps.length} 个缺口</small></span></div>
            <div className={unsignedHazardCount === 0 ? 'passed' : ''}><Icon icon={unsignedHazardCount === 0 ? 'tick-circle' : 'circle'} /><span><strong>危险项逐项签署通过</strong><small>{unsignedHazardCount} 项未签署或被退回</small></span></div>
            <div className={process.steps.every((step) => step.dependencies.every((id) => process.steps.some((item) => item.id === id))) ? 'passed' : ''}><Icon icon="git-merge" /><span><strong>依赖引用有效</strong><small>{process.steps.reduce((sum, step) => sum + step.dependencies.length, 0)} 条依赖</small></span></div>
            {freezeBlockers.length > 0 && (
              <div className="freeze-detail">
                <strong className="danger-text">卡住的具体步骤与危险项：</strong>
                <FreezeBlockerList blockers={freezeBlockers} />
              </div>
            )}
            <Button fill intent="primary" icon="lock" text="冻结当前版本" onClick={freezeVersion} disabled={freezeDisabled} />
          </Card>
        </main>
      )}

      <footer className="app-footer">
        <span>所有实验数据仅保存在当前浏览器 localStorage。</span>
        <span>Ctrl/Cmd + Z 撤销 · Ctrl/Cmd + Y 重做 · Ctrl/Cmd + S 保存</span>
      </footer>
    </div>
  );
}

function namedHazardsAll(steps: ProcessStep[]): number {
  return steps.reduce((sum, step) => sum + namedHazards(step).length, 0);
}

export default App;
