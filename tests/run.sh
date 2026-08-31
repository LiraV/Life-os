#!/bin/sh
# Прогон набора проверок. Падение — ненулевой код, PAGEERROR или маркер в выводе.
# Наборы идут параллельно (JOBS, по умолчанию 3): каждый поднимает свой Chromium,
# а ядер несколько. Вывод пишется в файлы и печатается по порядку — читается как раньше.
cd "$(dirname "$0")" || exit 1
# Каталог указываем явно: сервер, поднятый из чужого cwd, отдаёт 404 и роняет
# весь прогон непонятными ошибками — за сессию это случилось трижды.
APP=$(cd .. && pwd)
# Второй сервер отдаёт то же приложение по адресу /Life-os/ — так же, как это
# делает GitHub Pages. Префикс срезает сам сервер: симлинк, которым это делалось
# раньше, однажды уехал в коммит и уронил выкладку сайта.
# Ждём, пока сервер действительно ответит, а не «примерно секунду»: на холодной
# машине он не успевает, и весь прогон падает отказом в соединении.
serve() {
  curl -sf -o /dev/null "$3" && return 0
  setsid python3 ./srv.py "$1" "$2" "$4" >/dev/null 2>&1 &
  i=0
  while [ $i -lt 50 ]; do
    curl -sf -o /dev/null "$3" && return 0
    i=$((i + 1)); sleep 0.2
  done
  echo "сервер на порту $1 не поднялся" >&2; return 1
}
serve 8765 "$APP" http://127.0.0.1:8765/index.html || exit 1
serve 8766 "$APP" http://127.0.0.1:8766/Life-os/index.html /Life-os || exit 1

# Короткий режим: воротца плюс несколько наборов, задевающих основные связки.
# Хватает, чтобы после правки понять «не сломала ли», не дожидаясь полного прогона.
FAST='gate nav tabs logic model book sync cloud typing kopeck digest biz2 chat2 tag2 sheet ai2 sport4 update lost care2 studygoal relevant migshape migold mig rescue curve pace health2 once metrics norms free biz review inputs dyngoal dynsrc modgoal refs rollover sleep water3 bloggoal incgoal exgoal trips2 theme appicon sphereart blog blogtools laptop studylink meals dupes smoke flow days care tags sched noscroll'
ALL='gate nav tabs logic model book sync cloud typing kopeck digest biz2 chat2 tag2 sheet ai2 sport4 update lost care2 studygoal relevant migshape migold mig rescue curve pace health2 once metrics norms free biz review inputs dyngoal dynsrc modgoal refs rollover sleep water3 bloggoal incgoal exgoal trips2 theme appicon sphereart blog blogtools laptop studylink meals dupes smoke inbox work road mind due kanban flow goals goals2 slots counter intent cycle days energy traits me2 roles custom custom2 sex water2 carelib sgoals avatar chat tags edu study link sport sport2 sport3 sport5 sport6 sport7 sport8 sched sched2 tips mig6 mig7 migtag migmod modules psy books trips form care budget budtime vault vault2 water foodtest impexp export xss subpath noscroll stick rows sheets slider trackimp'
case "$1" in
  --fast) set -- $FAST ;;
  --all)  set -- $ALL ;;
esac

JOBS=${JOBS:-3}
OUT=$(mktemp -d)
start=$(date +%s)
printf '%s\n' "$@" | xargs -P "$JOBS" -I{} ./one.sh {} "$OUT"

pass=0; fail=0; failed=''
for t in "$@"; do
  line=$(cat "$OUT/$t.log" 2>/dev/null || echo '? не запустился')
  sec=$(cat "$OUT/$t.sec" 2>/dev/null || echo '?')
  if [ "$line" = "✓" ]; then
    pass=$((pass+1)); printf '  ✓ %-11s %3s с\n' "$t" "$sec"
  else
    fail=$((fail+1)); failed="$failed $t"
    printf '  ✗ %-11s %3s с  %s\n' "$t" "$sec" "$(printf '%s' "$line" | cut -c3-)"
  fi
done
printf '\nпрошло: %s, упало: %s%s · %s с\n' "$pass" "$fail" "${failed:+ →$failed}" "$(( $(date +%s) - start ))"
cp "$OUT"/*.full /tmp/failed 2>/dev/null; rm -rf "$OUT"
