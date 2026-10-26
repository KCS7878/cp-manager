#!/usr/bin/env bash
# CP 매니저 원클릭 실행 스크립트.
# - Node 22.5+ 의 내장 node:sqlite 사용 (외부 의존성 없음)
# - DB가 없으면 자동 생성 + 샘플 데이터 시드
# - 서버 실행: http://localhost:3000
set -e

cd "$(dirname "$0")"

PORT="${PORT:-3000}"
DB_FILE="data/cp-manager.db"

# Node 버전 확인 (22.5+ 필요)
NODE_MAJOR="$(node -p 'process.versions.node.split(".").map(Number)[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ Node.js 22.5 이상이 필요합니다 (현재: $(node --version)). node:sqlite 내장 모듈을 사용합니다."
  exit 1
fi

# DB 최초 생성 + 시드
if [ ! -f "$DB_FILE" ]; then
  echo "📦 데이터베이스가 없어 초기화합니다..."
  node --experimental-sqlite scripts/db-init.js
  node --experimental-sqlite scripts/db-seed.js
  echo "✅ 샘플 데이터 준비 완료"
fi

echo ""
echo "🚀 CP 매니저 시작 → http://localhost:${PORT}"
echo "   (중지: Ctrl+C)"
echo ""
exec node --experimental-sqlite server/index.js
