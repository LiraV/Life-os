# Многопоточная раздача файлов. python3 -m http.server держит одно соединение
# за раз: при трёх параллельных наборах браузеры вставали в очередь за
# картинками, и проверки мигали таймаутами на ровном месте.
#
# Третий аргумент — префикс пути: с ним сервер отдаёт то же приложение по
# адресу /Life-os/, как GitHub Pages. Раньше для этого рядом клался симлинк на
# корень репозитория; он однажды уехал в коммит с абсолютным путём и уронил
# выкладку сайта — на сервере такой симлинк битый.
import sys, functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

port, root = int(sys.argv[1]), sys.argv[2]
prefix = sys.argv[3] if len(sys.argv) > 3 else ''


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        if prefix and (path == prefix or path.startswith(prefix + '/')):
            path = path[len(prefix):] or '/'
        return super().translate_path(path)

    def log_message(self, *a, **k):
        pass


h = functools.partial(Handler, directory=root)
ThreadingHTTPServer(('127.0.0.1', port), h).serve_forever()
