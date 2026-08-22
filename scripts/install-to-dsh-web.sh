#!/usr/bin/env bash
# ============================================================
# colleague-plugin 一键安装到 DSH web profile
#
# 用法:
#   bash scripts/install-to-dsh-web.sh
#
# 做的事:
#   1. 构建 dist/
#   2. 用 dsh plugin --profile web add file:// 安装到 web profile
#   3. 重启 dsh web
#   4. 验证插件已挂载
# ============================================================
set -euo pipefail

# ---- 颜色 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[colleague]${NC} $1"; }
warn()  { echo -e "${YELLOW}[colleague]${NC} $1"; }
error() { echo -e "${RED}[colleague]${NC} $1" >&2; }

# ---- 定位插件根目录 ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
info "插件目录: $PLUGIN_DIR"

# ---- 检查 dsh 命令 ----
DSH_BIN=""
if command -v dsh &>/dev/null; then
  DSH_BIN="dsh"
elif [ -x "$HOME/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/lib/bin.js" ]; then
  DSH_BIN="node $HOME/.npm/_npx/1e7f6d9597241db0/node_modules/@deepseek-ai/dsh/lib/bin.js"
else
  error "未找到 dsh 命令。请先安装 DeepSeek Harness。"
  exit 1
fi
info "DSH 命令: $DSH_BIN"

# ---- 1. 构建 ----
info "步骤 1/4: 构建插件..."
cd "$PLUGIN_DIR"
if ! npx tsdown 2>&1 | tail -2; then
  error "构建失败"
  exit 1
fi
info "构建完成"

# ---- 2. 安装到 DSH web profile ----
info "步骤 2/4: 安装到 web profile..."

# 先移除旧版本（如果已安装）
$DSH_BIN plugin --profile web remove colleague-plugin 2>/dev/null || true

# 安装
if ! $DSH_BIN plugin --profile web add "file://$PLUGIN_DIR" 2>&1 | tail -5; then
  error "安装失败"
  exit 1
fi
info "安装完成"

# ---- 3. 重启 DSH web ----
info "步骤 3/4: 重启 DSH web..."
# 停止现有实例
if lsof -i :3080 -t &>/dev/null; then
  warn "端口 3080 已被占用，正在停止..."
  lsof -i :3080 -t 2>/dev/null | xargs kill -9 2>/dev/null || true
  sleep 2
fi

# 启动新实例
DSH_PROFILE_DIR="$HOME/.dsh/profiles/web"
cd "$DSH_PROFILE_DIR"
nohup $DSH_BIN web > /tmp/dsh-web.log 2>&1 &
info "DSH web 已启动 (PID: $!)"

# 等待启动
info "等待 DSH 启动..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3080/ &>/dev/null; then
    info "DSH web 已就绪"
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    warn "DSH web 启动超时，请检查 /tmp/dsh-web.log"
  fi
done

# ---- 4. 验证 ----
info "步骤 4/4: 验证插件..."
sleep 2

STATE=$(curl -sf http://127.0.0.1:3080/plugin-console/state 2>/dev/null || echo "")

if echo "$STATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
entries = [e for e in d.get('entries', []) if 'colleague' in e.get('entryId', '')]
if not entries:
    print('NOT_FOUND')
    sys.exit(1)
e = entries[0]
print(f\"status={e.get('fiberPhase')}, enabled={e.get('enabled')}, extra={e.get('extra')}\")
" 2>/dev/null; then
  info "插件已验证: $(echo "$STATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
entries = [e for e in d.get('entries', []) if 'colleague' in e.get('entryId', '')]
e = entries[0]
print(f\"status={e.get('fiberPhase')}, enabled={e.get('enabled')}, extra={e.get('extra')}\")
")"
else
  warn "插件未在 plugin-console state 中找到，请检查 DSH 日志: /tmp/dsh-web.log"
fi

# 验证 API 路由
API_STATE=$(curl -sf http://127.0.0.1:3080/plugins/colleague-plugin/state 2>/dev/null || echo "")
if [ -n "$API_STATE" ] && echo "$API_STATE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
members = d.get('members', [])
print(f'members={len(members)}')
" 2>/dev/null; then
  info "API 路由 /plugins/colleague-plugin/state 正常"
else
  warn "API 路由 /plugins/colleague-plugin/state 未就绪（webServer 可能尚未注册）"
fi

echo ""
info "${GREEN}========================================${NC}"
info "${GREEN}  安装完成!${NC}"
info "${GREEN}========================================${NC}"
echo ""
echo "  DSH Web:  http://127.0.0.1:3080"
echo "  设置 → 插件 → 插件管理 → 可以看到 colleague-plugin"
echo "  设置 → 插件 → 插件配置 → 可以看到团队面板卡片"
echo ""
