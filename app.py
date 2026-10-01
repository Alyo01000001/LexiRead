import http.server
import socketserver
import urllib.request
import urllib.parse
import urllib.error
import json
import sys
import os
from dropbox_service import DropboxService

PORT = int(os.environ.get('PORT', 8000))
dropbox_service = DropboxService()

def split_meanings(tr_str):
    if not tr_str:
        return []
    return [m.strip() for m in str(tr_str).split(' / ') if m.strip()]

def merge_vocabularies(local_items, remote_items):
    """
    Additive merge of local and remote vocabulary items.
    Never deletes words or definitions. Combines meanings with ' / '.
    """
    items_map = {}
    order = []

    all_items = (remote_items or []) + (local_items or [])
    for item in all_items:
        if not item or not isinstance(item, dict) or not item.get('original'):
            continue
        orig = str(item.get('original', '')).strip()
        src = str(item.get('src') or '').strip().lower()
        tgt = str(item.get('tgt') or '').strip().lower()
        key = f"{orig.lower()}___{src}___{tgt}"

        if key in items_map:
            existing = items_map[key]
            # Merge meanings
            existing_meanings = split_meanings(existing.get('translation', ''))
            new_meanings = split_meanings(item.get('translation', ''))
            for nm in new_meanings:
                if not any(em.lower() == nm.lower() for em in existing_meanings):
                    existing_meanings.append(nm)
            existing['translation'] = ' / '.join(existing_meanings)

            # Keep latest date
            existing_date = str(existing.get('date', ''))
            item_date = str(item.get('date', ''))
            if item_date and (not existing_date or item_date > existing_date):
                existing['date'] = item_date
        else:
            cleaned_meanings = []
            for nm in split_meanings(item.get('translation', '')) :
                if not any(em.lower() == nm.lower() for em in cleaned_meanings):
                    cleaned_meanings.append(nm)
            copy_item = dict(item)
            copy_item['original'] = orig
            copy_item['translation'] = ' / '.join(cleaned_meanings)
            items_map[key] = copy_item
            order.append(key)

    return [items_map[k] for k in order]

def merge_states(local_state, remote_state):
    """
    Merge reading progress per document.
    Last-Write-Wins based on lastReadAt timestamp.
    """
    local_docs = (local_state or {}).get('documents', {})
    remote_docs = (remote_state or {}).get('documents', {})
    all_keys = set(local_docs.keys()) | set(remote_docs.keys())

    merged_docs = {}
    for k in all_keys:
        loc = local_docs.get(k)
        rem = remote_docs.get(k)
        if loc and rem:
            loc_time = loc.get('lastReadAt', 0) or 0
            rem_time = rem.get('lastReadAt', 0) or 0
            if rem_time > loc_time:
                winner = dict(rem)
                # Keep local custom title or languages if remote lacks them
                for attr in ('customTitle', 'srcLang', 'tgtLang', 'name'):
                    if not winner.get(attr) and loc.get(attr):
                        winner[attr] = loc[attr]
                merged_docs[k] = winner
            else:
                winner = dict(loc)
                for attr in ('customTitle', 'srcLang', 'tgtLang', 'name'):
                    if not winner.get(attr) and rem.get(attr):
                        winner[attr] = rem[attr]
                merged_docs[k] = winner
        elif loc:
            merged_docs[k] = loc
        else:
            merged_docs[k] = rem

    return {
        "version": 1,
        "lastSync": int(time_now_ms()),
        "documents": merged_docs
    }

def time_now_ms():
    import time
    return int(time.time() * 1000)


class LexiReadHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable aggressive browser caching so mobile devices always get fresh files
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)

        if path == '/api/dropbox/status':
            status = dropbox_service.get_status()
            status['redirect_uri'] = self.get_redirect_uri()
            self.send_json(status)
        elif path == '/oauth/dropbox/login':
            self.handle_dropbox_oauth_login()
        elif path == '/oauth/dropbox/callback':
            self.handle_dropbox_oauth_callback(query)
        elif path == '/api/dropbox/sync-pull':
            self.handle_dropbox_sync_pull()
        elif path == '/api/dropbox/list-books':
            self.handle_dropbox_list_books()
        elif path == '/api/dropbox/download-book':
            self.handle_dropbox_download_book(query)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/translate/deepl':
            self.handle_deepl()
        elif self.path == '/translate/gemini':
            self.handle_gemini()
        elif self.path == '/api/dropbox/connect-token':
            self.handle_dropbox_connect_token()
        elif self.path == '/api/dropbox/connect-oauth':
            self.handle_dropbox_connect_oauth()
        elif self.path == '/api/dropbox/disconnect':
            dropbox_service.clear_config()
            self.send_json({"success": True})
        elif self.path == '/api/dropbox/sync-push':
            self.handle_dropbox_sync_push()
        elif self.path == '/api/dropbox/upload-book':
            self.handle_dropbox_upload_book()
        elif self.path == '/api/dropbox/config':
            self.handle_dropbox_save_config()
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

    # ========== DROPBOX HANDLERS ==========

    def get_redirect_uri(self):
        proto = self.headers.get('X-Forwarded-Proto')
        host = self.headers.get('Host', f'localhost:{PORT}')
        if host.startswith('127.0.0.1'):
            host = host.replace('127.0.0.1', 'localhost', 1)
        if not proto:
            proto = 'http' if host.startswith('localhost') else 'https'
        return f"{proto}://{host}/oauth/dropbox/callback"

    def handle_dropbox_oauth_login(self):
        app_key = dropbox_service.get_app_key()
        if not app_key:
            self.send_response(302)
            self.send_header('Location', '/?dropbox_error=missing_app_key')
            self.end_headers()
            return

        redirect_uri = self.get_redirect_uri()
        params = {
            'client_id': app_key,
            'response_type': 'code',
            'token_access_type': 'offline',
            'redirect_uri': redirect_uri
        }
        auth_url = 'https://www.dropbox.com/oauth2/authorize?' + urllib.parse.urlencode(params)
        self.send_response(302)
        self.send_header('Location', auth_url)
        self.end_headers()

    def handle_dropbox_oauth_callback(self, query):
        error = query.get('error_description', query.get('error', ['']))[0]
        if error:
            self.send_response(302)
            self.send_header('Location', f'/?dropbox_error={urllib.parse.quote(error)}')
            self.end_headers()
            return

        code = query.get('code', [''])[0].strip()
        if not code:
            self.send_response(302)
            self.send_header('Location', '/?dropbox_error=missing_code')
            self.end_headers()
            return

        app_key = dropbox_service.get_app_key()
        app_secret = dropbox_service.get_app_secret()
        redirect_uri = self.get_redirect_uri()

        res = dropbox_service.connect_with_oauth_code(app_key, app_secret, code, redirect_uri)
        if res.get('success'):
            self.send_response(302)
            self.send_header('Location', '/?dropbox_connected=1')
            self.end_headers()
        else:
            err_msg = res.get('error', 'OAuth authorization failed')
            self.send_response(302)
            self.send_header('Location', f'/?dropbox_error={urllib.parse.quote(err_msg)}')
            self.end_headers()

    def handle_dropbox_save_config(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body.decode('utf-8'))
            app_key = payload.get('app_key', '').strip()
            app_secret = payload.get('app_secret', '').strip()
            if app_key:
                dropbox_service.set_app_credentials(app_key, app_secret)
                self.send_json({"success": True, "has_app_key": True})
            else:
                self.send_json({"success": False, "error": "App Key cannot be empty"}, status=400)
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_dropbox_connect_token(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body.decode('utf-8'))
            token = payload.get('token', '')
            res = dropbox_service.connect_with_token(token)
            self.send_json(res, status=200 if res.get('success') else 400)
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_dropbox_connect_oauth(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body.decode('utf-8'))
            app_key = payload.get('app_key', '')
            app_secret = payload.get('app_secret', '')
            code = payload.get('code', '')
            redirect_uri = payload.get('redirect_uri', '')
            res = dropbox_service.connect_with_oauth_code(app_key, app_secret, code, redirect_uri)
            self.send_json(res, status=200 if res.get('success') else 400)
        except Exception as e:
            self.send_json({"success": False, "error": str(e)}, status=400)

    def handle_dropbox_sync_pull(self):
        if not dropbox_service.is_connected():
            self.send_json({"success": False, "error": "Not connected to Dropbox"}, status=400)
            return

        sync_state = None
        saved_vocab = []

        # 1. Download sync_state.json
        state_bytes, _ = dropbox_service.download_file('/sync_state.json')
        if state_bytes:
            try:
                sync_state = json.loads(state_bytes.decode('utf-8'))
            except Exception as e:
                print(f"[LexiRead] Warning parsing remote sync_state.json: {e}")

        # 2. Download saved_vocabulary.json
        vocab_bytes, _ = dropbox_service.download_file('/saved_vocabulary.json')
        if vocab_bytes:
            try:
                v_data = json.loads(vocab_bytes.decode('utf-8'))
                saved_vocab = v_data.get('items', []) if isinstance(v_data, dict) else v_data
            except Exception as e:
                print(f"[LexiRead] Warning parsing remote saved_vocabulary.json: {e}")

        self.send_json({
            "success": True,
            "syncState": sync_state,
            "savedVocabulary": saved_vocab
        })

    def handle_dropbox_sync_push(self):
        if not dropbox_service.is_connected():
            self.send_json({"success": False, "error": "Not connected to Dropbox"}, status=400)
            return

        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            payload = json.loads(body.decode('utf-8'))
        except Exception as e:
            self.send_json({"success": False, "error": f"Invalid JSON: {e}"}, status=400)
            return

        local_state = payload.get('syncState')
        local_vocab = payload.get('savedVocabulary')

        merged_state = None
        merged_vocab = None

        # 1. Sync State (Reading positions)
        if local_state is not None:
            remote_state_bytes, _ = dropbox_service.download_file('/sync_state.json')
            remote_state = None
            if remote_state_bytes:
                try:
                    remote_state = json.loads(remote_state_bytes.decode('utf-8'))
                except Exception:
                    pass
            merged_state = merge_states(local_state, remote_state)
            upload_res = dropbox_service.upload_file(
                '/sync_state.json',
                json.dumps(merged_state, ensure_ascii=False, indent=2).encode('utf-8')
            )
            if not upload_res.get('success'):
                print(f"[LexiRead] Warning uploading sync_state.json: {upload_res.get('error')}")

        # 2. Saved Vocabulary (Additively merged)
        if local_vocab is not None:
            remote_vocab_bytes, _ = dropbox_service.download_file('/saved_vocabulary.json')
            remote_vocab = []
            if remote_vocab_bytes:
                try:
                    rv = json.loads(remote_vocab_bytes.decode('utf-8'))
                    remote_vocab = rv.get('items', []) if isinstance(rv, dict) else rv
                except Exception:
                    pass
            merged_vocab = merge_vocabularies(local_vocab, remote_vocab)
            vocab_doc = {
                "version": 1,
                "lastSync": int(time_now_ms()),
                "items": merged_vocab
            }
            upload_res = dropbox_service.upload_file(
                '/saved_vocabulary.json',
                json.dumps(vocab_doc, ensure_ascii=False, indent=2).encode('utf-8')
            )
            if not upload_res.get('success'):
                print(f"[LexiRead] Warning uploading saved_vocabulary.json: {upload_res.get('error')}")

        self.send_json({
            "success": True,
            "syncState": merged_state,
            "savedVocabulary": merged_vocab
        })

    def handle_dropbox_upload_book(self):
        if not dropbox_service.is_connected():
            self.send_json({"success": False, "error": "Not connected to Dropbox"}, status=400)
            return

        book_name = self.headers.get('X-Dropbox-Book-Name', '')
        book_name = urllib.parse.unquote(book_name).strip()
        if not book_name:
            self.send_json({"success": False, "error": "Missing X-Dropbox-Book-Name header"}, status=400)
            return

        # Sanitize filename
        safe_name = os.path.basename(book_name).replace('/', '_').replace('\\', '_')
        length = int(self.headers.get('Content-Length', 0))
        book_bytes = self.rfile.read(length)

        dest_path = f"/Books/{safe_name}"
        res = dropbox_service.upload_file(dest_path, book_bytes, overwrite=True)
        if res.get('success'):
            self.send_json({"success": True, "path": dest_path})
        else:
            self.send_json({"success": False, "error": res.get('error')}, status=500)

    def handle_dropbox_list_books(self):
        if not dropbox_service.is_connected():
            self.send_json({"success": False, "error": "Not connected to Dropbox"}, status=400)
            return

        res = dropbox_service.list_folder("/Books")
        if not res.get('success'):
            # Folder might not exist yet, return empty list
            self.send_json({"success": True, "books": []})
            return

        books = []
        for entry in res.get('entries', []):
            if entry.get('.tag') == 'file':
                name = entry.get('name', '')
                ext = name.split('.')[-1].lower() if '.' in name else ''
                if ext in ('pdf', 'docx', 'txt', 'epub'):
                    books.append({
                        "name": name,
                        "path": entry.get('path_display', f"/Books/{name}"),
                        "size": entry.get('size', 0),
                        "modified": entry.get('client_modified', '')
                    })
        self.send_json({"success": True, "books": books})

    def handle_dropbox_download_book(self, query):
        if not dropbox_service.is_connected():
            self.send_error(400, "Not connected to Dropbox")
            return

        book_path = query.get('path', [''])[0].strip()
        if not book_path:
            self.send_error(400, "Missing path query parameter")
            return

        content, meta = dropbox_service.download_file(book_path)
        if content is None:
            self.send_error(404, f"Book not found: {meta}")
            return

        filename = os.path.basename(book_path)
        self.send_response(200)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Disposition', f'attachment; filename="{filename}"')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)


if __name__ == '__main__':
    print(f"[LexiRead] Starting local backend on http://localhost:{PORT}")
    print("[LexiRead] Proxies: DeepL, Gemini API, and Dropbox Cloud Sync.")
    with socketserver.TCPServer(("", PORT), LexiReadHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down...")
            sys.exit(0)
