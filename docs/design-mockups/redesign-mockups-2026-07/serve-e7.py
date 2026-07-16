# ponytail: stdlib no-cache static server — prototypes iterate fast, stale module cache burns reviewers
import http.server, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', 8766), H).serve_forever()
