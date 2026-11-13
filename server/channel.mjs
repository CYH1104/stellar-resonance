// 两个部署实例使用相同功能（均支持手机终端）；通道名继续用于账号、Cookie 与目录隔离。
// 通道必须是部署配置，而不是用户可导入导出的开关：导入备份不应改变正在运行的功能面。
export const CHANNELS = ['stable', 'test'];
export const TEST_PORT = 9000;

export function normalizeChannel(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!raw) return '';
  if (!CHANNELS.includes(raw)) throw Object.assign(Error('INVALID_TERMINAL_CHANNEL'), { code: 'INVALID_TERMINAL_CHANNEL' });
  return raw;
}

// 沿用原端口身份：9000 为 test，其余端口（默认 8807）为 stable，不迁移账号目录。
export function channelForPort(port) {
  return Number(port) === TEST_PORT ? 'test' : 'stable';
}

// 显式配置优先；没有配置时按端口判断，保持原实例身份与 Cookie 名称。
export function resolveChannel({ explicit = '', port } = {}) {
  return normalizeChannel(explicit) || channelForPort(port);
}

export function terminalEnabledFor(channel) {
  return !!normalizeChannel(channel);
}

const INSTANCE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
// 保留名同时是数据目录与 Cookie 后缀的默认值：它们不能跨通道复用，
// 否则 test 通道可以打开正式账号库、正式编辑器资料或覆盖正式 runtime。
const RESERVED = { stable: 'stable', test: 'test' };

// 实例名用于数据目录、日志、服务名与 Cookie 后缀；稳定版沿用现有目录，测试版独立。
export function resolveInstanceName({ explicit = '', channel }) {
  const resolved = normalizeChannel(channel) || 'stable';
  const raw = typeof explicit === 'string' ? explicit.trim() : '';
  if (raw) {
    if (!INSTANCE_PATTERN.test(raw) || RESERVED[raw] && RESERVED[raw] !== resolved) {
      throw Object.assign(Error('INVALID_TERMINAL_INSTANCE'), { code: 'INVALID_TERMINAL_INSTANCE' });
    }
    return raw;
  }
  return resolved;
}

// 路径、Cookie、日志与启动复用都从同一个实例描述派生，避免各自推断出不一致的身份。
export function instanceDescriptor({ channel, instanceName }) {
  const resolvedChannel = normalizeChannel(channel) || 'stable';
  const name = resolveInstanceName({ explicit: instanceName, channel: resolvedChannel });
  const stable = name === 'stable';
  return {
    channel: resolvedChannel,
    instanceName: name,
    terminal: terminalEnabledFor(resolvedChannel),
    stable,
    // 稳定版沿用既有 Cookie 名称，避免升级时把已登录用户踢下线。
    cookieSuffix: stable ? '' : `_${name}`,
    editorCookie: stable ? 'academy_editor' : `academy_editor_${name}`,
  };
}
