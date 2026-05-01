import http.server
import socketserver

class COIRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

PORT = 8080
with socketserver.TCPServer(("", PORT), COIRequestHandler) as httpd:
    print("Serving at port", PORT, "with COOP and COEP headers")
    httpd.serve_forever()
