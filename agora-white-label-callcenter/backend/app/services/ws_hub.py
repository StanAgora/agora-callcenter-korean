"""
WebSocket hub: manages per-survey subscriber sets and broadcasts JSON messages.
"""
from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionHub:
    def __init__(self) -> None:
        # survey_id → set of WebSocket connections
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)

    def connect(self, survey_id: str, ws: WebSocket) -> None:
        self._connections[survey_id].add(ws)
        logger.debug('WS connected survey=%s total=%d', survey_id, len(self._connections[survey_id]))

    def disconnect(self, survey_id: str, ws: WebSocket) -> None:
        self._connections[survey_id].discard(ws)
        logger.debug('WS disconnected survey=%s total=%d', survey_id, len(self._connections[survey_id]))

    async def broadcast(self, survey_id: str, message: dict) -> None:
        dead: list[WebSocket] = []
        text = json.dumps(message, ensure_ascii=False)
        for ws in list(self._connections.get(survey_id, [])):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(survey_id, ws)

    async def send_personal(self, ws: WebSocket, message: dict) -> None:
        await ws.send_text(json.dumps(message, ensure_ascii=False))


hub = ConnectionHub()
