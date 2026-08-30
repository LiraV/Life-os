#!/bin/sh
# Один набор: печатает вердикт в файл. Отдельным скриптом, чтобы вызываться из xargs.
cd "$(dirname "$0")" || exit 1
t="$1"; out="$2/$1.log"
[ -f "$t.mjs" ] || { echo "? нет файла" > "$out"; exit 0; }
st=$(date +%s)
o=$(timeout 200 node "$t.mjs" 2>&1); code=$?
echo $(( $(date +%s) - st )) > "$2/$1.sec"
if [ $code -ne 0 ] || printf '%s' "$o" | grep -qE 'PAGEERROR|ПУСТО|✗|НЕ ОТКРЫЛОСЬ|ОШИБКА|ПОТЕРЯНЫ|СЛОМАН|ОСТАЛАСЬ СТАРАЯ'; then
  printf '✗ %s\n' "$(printf '%s' "$o" | grep -E 'PAGEERROR|Error:|✗|ПУСТО' | head -1 | cut -c1-88)" > "$out"
  printf '%s\n' "$o" > "$2/$1.full"
else
  printf '✓\n' > "$out"
fi
