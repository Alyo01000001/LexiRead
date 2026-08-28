import http.server
import socketserver
import urllib.request
import urllib.parse
import urllib.error
import json
import sys
import os

PORT = int(os.environ.get('PORT', 8000))

class LexiReadHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/translate/deepl':
            self.handle_deepl()
        elif self.path == '/translate/gemini':
            self.handle_gemini()
        else:
            self.send_error(404)

    def handle_deepl(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        auth_header = self.headers.get('Authorization', '')
        api_key = auth_header.replace('DeepL-Auth-Key ', '').strip()
        if not api_key:
            self.send_error(401, "No API key provided")
            return

        endpoint = 'https://api-free.deepl.com/v2/translate' if api_key.endswith(':fx') else 'https://api.deepl.com/v2/translate'
        
        headers = {
            'Authorization': f'DeepL-Auth-Key {api_key}',
            'Content-Type': 'application/json'
        }
        
        req = urllib.request.Request(endpoint, data=post_data, headers=headers, method='POST')
        self.forward_request(req)

    def handle_gemini(self):
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length)
        
        auth_header = self.headers.get('Authorization', '')
        api_key = auth_header.replace('Bearer ', '').strip()
        if not api_key:
            self.send_error(401, "No API key provided")
            return

        model = self.headers.get('X-Gemini-Model', 'gemini-3.5-flash-lite')
        endpoint = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}'
        
        headers = {
            'Content-Type': 'application/json'
        }
        
        req = urllib.request.Request(endpoint, data=post_data, headers=headers, method='POST')
        self.forward_request(req)

    def forward_request(self, req):
        try:
            with urllib.request.urlopen(req) as response:
                resp_data = response.read()
                self.send_response(response.status)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(resp_data)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_error(500, str(e))

if __name__ == '__main__':
    print(f"[LexiRead] Starting local backend on http://localhost:{PORT}")
    print("[LexiRead] This backend safely proxies requests to DeepL & Gemini APIs.")
    with socketserver.TCPServer(("", PORT), LexiReadHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
            sys.exit(0)
