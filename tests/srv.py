# Многопоточная раздача файлов. python3 -m http.server держит одно соединение
# за раз: при трёх параллельных наборах браузеры вставали в очередь за
# картинками, и проверки мигали таймаутами на ровном месте.
import sys, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

port, root = int(sys.argv[1]), sys.argv[2]
h = functools.partial(SimpleHTTPRequestHandler, directory=root)
h.log_message = lambda *a, **k: None
ThreadingHTTPServer(('127.0.0.1', port), h).serve_forever()
