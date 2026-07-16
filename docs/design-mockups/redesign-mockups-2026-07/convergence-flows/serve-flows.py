# ponytail: stdlib no-cache static server — same pattern as ../serve-e7.py; stale module cache burns reviewers
import http.server, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
http.server.ThreadingHTTPServer(('127.0.0.1', 8134), H).serve_forever()
