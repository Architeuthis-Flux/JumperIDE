import http.server
import socketserver

class COIRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()

PORT = 8080
with socketserver.TCPServer(("", PORT), COIRequestHandler) as httpd:
    print("Serving at port", PORT, "with COOP and COEP headers")
    httpd.serve_forever()
