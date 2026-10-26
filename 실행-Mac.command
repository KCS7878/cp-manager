#!/bin/bash
cd "$(dirname "$0")"
echo "CP 매니저를 시작합니다..."
echo "브라우저에서 http://localhost:3000 으로 접속하세요."
echo "(이 창은 끄지 마세요. 끄면 앱도 꺼집니다.)"
node --experimental-sqlite scripts/start.js
