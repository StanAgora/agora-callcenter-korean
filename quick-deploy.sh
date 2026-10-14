#!/usr/bin/env bash
#
# Agora Call Center (Tokyo Energy) - 主机一键构建并部署
#
# 用法：
#   ./quick-deploy.sh
#   CALLCENTER_PREFIX=/agora-callcenter-tokyo/ ./quick-deploy.sh
#
# 说明：
# - 默认把前端构建基路径设置为 CALLCENTER_PREFIX（默认 /），
#   需与前置网关 location 前缀保持一致。
# - FastAPI 仅容器内 127.0.0.1:8000；内层 nginx 监听容器内 :8080，不映射到宿主机。
# - 仅 whip-network 内其它容器（如前置网关）可访问 agora-callcenter-tokyo:8080。
# - 构建：容器内 NODE_ENV=production + vite build（见 agora-white-label-callcenter/Dockerfile）。
# - .env 须与本脚本同目录（由 CICD 自动拷贝）。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${SCRIPT_DIR}/.env"
DEFAULT_PREFIX="/"

# 从 .env 读取 CALLCENTER_PREFIX（若环境变量未设置）
if [[ -z "${CALLCENTER_PREFIX:-}" && -f "$ENV_FILE" ]]; then
  _prefix_from_env=$(grep -m1 '^CALLCENTER_PREFIX=' "$ENV_FILE" | cut -d= -f2- | tr -d '[:space:]"'"'" 2>/dev/null || true)
  [[ -n "$_prefix_from_env" ]] && CALLCENTER_PREFIX="$_prefix_from_env"
fi
CALLCENTER_PREFIX="${CALLCENTER_PREFIX:-$DEFAULT_PREFIX}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "错误: 未找到 ${COMPOSE_FILE}"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "错误: 未找到 ${ENV_FILE}"
  echo "CICD 应将配置好的 .env 拷贝到 ${SCRIPT_DIR} 后再执行本脚本。"
  exit 1
fi

if [[ "$CALLCENTER_PREFIX" != /* ]]; then
  echo "错误: CALLCENTER_PREFIX 必须以 / 开头，例如 /agora-callcenter-tokyo/"
  exit 1
fi
if [[ "$CALLCENTER_PREFIX" != */ ]]; then
  CALLCENTER_PREFIX="${CALLCENTER_PREFIX}/"
fi

echo "==> Deploy dir: ${SCRIPT_DIR}"
echo "==> Frontend base path (VITE_BASE_PATH): ${CALLCENTER_PREFIX}"
echo "==> Ensure docker network whip-network exists"
docker network create whip-network >/dev/null 2>&1 || true

export VITE_BASE_PATH="$CALLCENTER_PREFIX"

# 强制使新提交的代码使 Docker 层缓存失效，避免 BuildKit 误判未变更而复用旧镜像层。
export CACHEBUST="$(git -C "$SCRIPT_DIR" rev-parse HEAD 2>/dev/null || date +%s)"

echo "==> Build image and start service"
docker compose -f "$COMPOSE_FILE" build
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo "==> Done（未绑定宿主机端口；勿将 :8000/:8080 暴露到公网）"
echo "    公网访问须走前置网关，路径前缀须与构建时一致，例如："
echo "    SPA:  https://<域名>${CALLCENTER_PREFIX}"
echo "    API:  https://<域名>${CALLCENTER_PREFIX%/}/api/..."
