"""YouTube Data API v3 upload (OAuth, resumable upload, custom thumbnail)."""
from __future__ import annotations

import logging
import time
from pathlib import Path

from .config import ROOT

log = logging.getLogger("youtube")

SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube"]
CLIENT_SECRET = ROOT / "client_secret.json"
TOKEN = ROOT / "token.json"


def _creds(interactive: bool = False):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    creds = None
    if TOKEN.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN), SCOPES)
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
        TOKEN.write_text(creds.to_json(), encoding="utf-8")
    if (not creds or not creds.valid) and interactive:
        from google_auth_oauthlib.flow import InstalledAppFlow
        if not CLIENT_SECRET.exists():
            raise FileNotFoundError(f"Put your Google OAuth file at {CLIENT_SECRET} (see README)")
        flow = InstalledAppFlow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES)
        creds = flow.run_local_server(port=0, prompt="consent")
        TOKEN.write_text(creds.to_json(), encoding="utf-8")
    return creds if creds and creds.valid else None


def login() -> str:
    creds = _creds(interactive=True)
    yt = _service(creds)
    ch = yt.channels().list(part="snippet", mine=True).execute()
    items = ch.get("items") or []
    return items[0]["snippet"]["title"] if items else "(no channel found on this account)"


# --- Login from a phone / remote server (no local browser) ---------------
# Google sends you back to http://localhost:8090/?code=... which won't load on a phone:
# that's expected. You copy that address and paste it into the panel.
_pending_flow = None
REMOTE_REDIRECT = "http://localhost:8090/"


def remote_login_url() -> str:
    global _pending_flow
    import os
    from google_auth_oauthlib.flow import Flow
    if not CLIENT_SECRET.exists():
        raise FileNotFoundError("Upload client_secret.json first")
    os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"
    _pending_flow = Flow.from_client_secrets_file(str(CLIENT_SECRET), SCOPES, redirect_uri=REMOTE_REDIRECT)
    url, _ = _pending_flow.authorization_url(access_type="offline", prompt="consent")
    return url


def remote_login_finish(pasted: str) -> str:
    import os
    from urllib.parse import parse_qs, urlparse
    if _pending_flow is None:
        raise RuntimeError("Press 'Connect YouTube' again first")
    os.environ["OAUTHLIB_INSECURE_TRANSPORT"] = "1"  # localhost redirect is http
    pasted = pasted.strip()
    code = parse_qs(urlparse(pasted).query).get("code", [None])[0] if pasted.startswith("http") else pasted
    if not code:
        raise ValueError("No code found in what you pasted")
    _pending_flow.fetch_token(code=code)
    TOKEN.write_text(_pending_flow.credentials.to_json(), encoding="utf-8")
    yt = _service(_pending_flow.credentials)
    items = yt.channels().list(part="snippet", mine=True).execute().get("items") or []
    return items[0]["snippet"]["title"] if items else "(no channel on this account)"


def _service(creds):
    from googleapiclient.discovery import build
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def is_ready() -> bool:
    try:
        return _creds() is not None
    except Exception:  # noqa: BLE001
        return False


def upload(video: Path, title: str, description: str, tags: list[str], privacy: str,
           category_id: str = "20", made_for_kids: bool = False, thumbnail: Path | None = None) -> str:
    from googleapiclient.errors import HttpError
    from googleapiclient.http import MediaFileUpload

    creds = _creds()
    if not creds:
        raise RuntimeError("YouTube is not connected. Run:  python -m gtabot youtube-login")
    yt = _service(creds)
    # YouTube limits: title <= 100 chars, tags total <= 500 chars
    title = title.replace("<", "").replace(">", "")[:100]
    clean_tags, total = [], 0
    for t in tags:
        t = t.replace("#", "").replace("<", "").replace(">", "").strip()
        if t and total + len(t) + 2 <= 480:
            clean_tags.append(t)
            total += len(t) + 2
    body = {
        "snippet": {"title": title, "description": description[:4900], "tags": clean_tags,
                    "categoryId": category_id},
        "status": {"privacyStatus": privacy, "selfDeclaredMadeForKids": made_for_kids},
    }
    media = MediaFileUpload(str(video), chunksize=8 * 1024 * 1024, resumable=True, mimetype="video/mp4")
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)
    resp, retries = None, 0
    while resp is None:
        try:
            status, resp = req.next_chunk()
            if status:
                log.info("Uploading %s: %d%%", video.name, int(status.progress() * 100))
        except HttpError as e:
            if e.resp.status in (500, 502, 503, 504) and retries < 5:
                retries += 1
                time.sleep(2 ** retries)
                continue
            raise
    vid = resp["id"]
    log.info("Uploaded: https://youtu.be/%s", vid)
    if thumbnail and Path(thumbnail).exists():
        try:
            yt.thumbnails().set(videoId=vid, media_body=MediaFileUpload(str(thumbnail))).execute()
        except HttpError as e:
            # Custom thumbnails need a phone-verified channel
            log.warning("Thumbnail not set (verify your channel at youtube.com/verify): %s", e)
    return vid
