"""
LexiRead — Dropbox Cloud Sync Service
Zero external dependencies (uses standard library urllib, json, os, time)
Supports:
  1. Access Token authentication (simple paste)
  2. OAuth 2.0 PKCE / Authorization Code flow with auto refresh token
  3. Reading state sync (sync_state.json)
  4. Vocabulary sync (saved_vocabulary.json)
  5. Book file upload & listing (/Books/)
"""

import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error

CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dropbox_config.json')

class DropboxService:
    def __init__(self, config_path=CONFIG_FILE):
        self.config_path = config_path
        self._config = self._load_config()

    def _load_config(self):
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                print(f"[DropboxService] Warning: Failed to load {self.config_path}: {e}")
        return {}

    def _save_config(self):
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
            return True
        except Exception as e:
            print(f"[DropboxService] Error saving config: {e}")
            return False

    def clear_config(self):
        self._config = {}
        if os.path.exists(self.config_path):
            try:
                os.remove(self.config_path)
            except Exception as e:
                print(f"[DropboxService] Error removing config file: {e}")
        return True

    def is_connected(self):
        token = self.get_valid_token()
        return bool(token)

    def get_app_key(self):
        return (os.environ.get('DROPBOX_APP_KEY') or self._config.get('app_key') or '').strip()

    def get_app_secret(self):
        return (os.environ.get('DROPBOX_APP_SECRET') or self._config.get('app_secret') or '').strip()

    def set_app_credentials(self, app_key, app_secret=""):
        self._config["app_key"] = (app_key or "").strip()
        if app_secret is not None:
            self._config["app_secret"] = (app_secret or "").strip()
        self._save_config()
        return True

    def get_status(self):
        token = self.get_valid_token()
        app_key = self.get_app_key()
        has_key = bool(app_key)
        if not token:
            return {
                "connected": False,
                "email": None,
                "name": None,
                "mode": None,
                "has_app_key": has_key,
                "app_key": app_key
            }
        return {
            "connected": True,
            "email": self._config.get("account_email", "Connected"),
            "name": self._config.get("account_name", "Dropbox User"),
            "mode": self._config.get("auth_mode", "token"),
            "has_app_key": has_key,
            "app_key": app_key
        }

    def get_valid_token(self):
        access_token = self._config.get("access_token")
        refresh_token = self._config.get("refresh_token")
        expires_at = self._config.get("expires_at", 0)

        # If we have an access token and it's not expired (or no expiration set, e.g. long-lived token)
        now = time.time()
        if access_token:
            if not expires_at or expires_at > (now + 60):
                return access_token

        # Try to refresh if refresh token is available
        if refresh_token and self._config.get("app_key"):
            refreshed = self.refresh_access_token()
            if refreshed:
                return self._config.get("access_token")

        return access_token

    def connect_with_token(self, token):
        token = (token or "").strip()
        if not token:
            return {"success": False, "error": "Token cannot be empty"}

        info = self.fetch_account_info(token)
        if not info:
            return {"success": False, "error": "Invalid Dropbox token or network error"}

        self._config = {
            "access_token": token,
            "auth_mode": "token",
            "account_id": info.get("account_id"),
            "account_name": info.get("name", {}).get("display_name", "Dropbox User"),
            "account_email": info.get("email", ""),
            "connected_at": int(time.time() * 1000)
        }
        self._save_config()
        return {
            "success": True,
            "name": self._config["account_name"],
            "email": self._config["account_email"]
        }

    def connect_with_oauth_code(self, app_key, app_secret, code, redirect_uri):
        app_key = (app_key or "").strip()
        code = (code or "").strip()
        redirect_uri = (redirect_uri or "").strip()

        data = {
            "code": code,
            "grant_type": "authorization_code",
            "client_id": app_key,
            "redirect_uri": redirect_uri
        }
        if app_secret:
            data["client_secret"] = app_secret.strip()

        encoded_data = urllib.parse.urlencode(data).encode('utf-8')
        req = urllib.request.Request(
            "https://api.dropboxapi.com/oauth2/token",
            data=encoded_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req) as resp:
                resp_json = json.loads(resp.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8', errors='ignore')
            return {"success": False, "error": f"OAuth exchange failed ({e.code}): {err_body}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

        new_access_token = resp_json.get("access_token")
        new_refresh_token = resp_json.get("refresh_token")
        expires_in = resp_json.get("expires_in", 14400) # Dropbox default is 4 hours

        info = self.fetch_account_info(new_access_token)
        account_name = info.get("name", {}).get("display_name", "Dropbox User") if info else "Dropbox User"
        account_email = info.get("email", "") if info else ""
        account_id = info.get("account_id", "") if info else resp_json.get("account_id", "")

        self._config = {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "app_key": app_key,
            "app_secret": app_secret,
            "expires_at": time.time() + expires_in,
            "auth_mode": "oauth",
            "account_id": account_id,
            "account_name": account_name,
            "account_email": account_email,
            "connected_at": int(time.time() * 1000)
        }
        self._save_config()
        return {
            "success": True,
            "name": account_name,
            "email": account_email
        }

    def refresh_access_token(self):
        refresh_token = self._config.get("refresh_token")
        app_key = self._config.get("app_key")
        app_secret = self._config.get("app_secret")

        if not refresh_token or not app_key:
            return False

        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": app_key
        }
        if app_secret:
            data["client_secret"] = app_secret

        encoded_data = urllib.parse.urlencode(data).encode('utf-8')
        req = urllib.request.Request(
            "https://api.dropboxapi.com/oauth2/token",
            data=encoded_data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req) as resp:
                resp_json = json.loads(resp.read().decode('utf-8'))
                new_token = resp_json.get("access_token")
                expires_in = resp_json.get("expires_in", 14400)
                if new_token:
                    self._config["access_token"] = new_token
                    self._config["expires_at"] = time.time() + expires_in
                    self._save_config()
                    return True
        except Exception as e:
            print(f"[DropboxService] Token refresh error: {e}")
        return False

    def fetch_account_info(self, token):
        req = urllib.request.Request(
            "https://api.dropboxapi.com/2/users/get_current_account",
            data=b'null',
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            print(f"[DropboxService] Failed to fetch account info: {e}")
            return None

    def upload_file(self, path, content_bytes, overwrite=True):
        token = self.get_valid_token()
        if not token:
            return {"success": False, "error": "Not connected to Dropbox"}

        # Path must start with /
        if not path.startswith('/'):
            path = '/' + path

        api_arg = {
            "path": path,
            "mode": "overwrite" if overwrite else "add",
            "autorename": False,
            "mute": True,
            "strict_conflict": False
        }

        req = urllib.request.Request(
            "https://content.dropboxapi.com/2/files/upload",
            data=content_bytes,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream",
                "Dropbox-API-Arg": json.dumps(api_arg)
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(req) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                return {"success": True, "metadata": res_data}
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8', errors='ignore')
            return {"success": False, "error": f"Upload failed ({e.code}): {err_msg}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def download_file(self, path):
        token = self.get_valid_token()
        if not token:
            return None, "Not connected to Dropbox"

        if not path.startswith('/'):
            path = '/' + path

        api_arg = {"path": path}

        req = urllib.request.Request(
            "https://content.dropboxapi.com/2/files/download",
            headers={
                "Authorization": f"Bearer {token}",
                "Dropbox-API-Arg": json.dumps(api_arg)
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(req) as resp:
                content = resp.read()
                meta_header = resp.headers.get("dropbox-api-result", "{}")
                metadata = json.loads(meta_header)
                return content, metadata
        except urllib.error.HTTPError as e:
            if e.code == 409:
                # File not found
                return None, "not_found"
            err_msg = e.read().decode('utf-8', errors='ignore')
            return None, f"Download failed ({e.code}): {err_msg}"
        except Exception as e:
            return None, str(e)

    def list_folder(self, path=""):
        token = self.get_valid_token()
        if not token:
            return {"success": False, "error": "Not connected to Dropbox"}

        # For root in App folder, path should be ""
        if path == "/":
            path = ""

        payload = {
            "path": path,
            "recursive": False,
            "include_media_info": False,
            "include_deleted": False
        }

        req = urllib.request.Request(
            "https://api.dropboxapi.com/2/files/list_folder",
            data=json.dumps(payload).encode('utf-8'),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            method="POST"
        )

        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return {"success": True, "entries": data.get("entries", [])}
        except urllib.error.HTTPError as e:
            if e.code == 409:
                # Path doesn't exist yet (e.g. /Books folder not created yet)
                return {"success": True, "entries": []}
            err_msg = e.read().decode('utf-8', errors='ignore')
            return {"success": False, "error": f"List folder failed ({e.code}): {err_msg}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def create_folder(self, path):
        token = self.get_valid_token()
        if not token:
            return {"success": False, "error": "Not connected"}

        if not path.startswith('/'):
            path = '/' + path

        payload = {"path": path, "autorename": False}
        req = urllib.request.Request(
            "https://api.dropboxapi.com/2/files/create_folder_v2",
            data=json.dumps(payload).encode('utf-8'),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return {"success": True, "data": json.loads(resp.read().decode('utf-8'))}
        except urllib.error.HTTPError as e:
            if e.code == 409: # Already exists
                return {"success": True, "already_exists": True}
            return {"success": False, "error": e.read().decode('utf-8', errors='ignore')}
        except Exception as e:
            return {"success": False, "error": str(e)}
