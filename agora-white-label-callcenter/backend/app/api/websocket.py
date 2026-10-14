"""
WebSocket endpoint: /ws/campaigns/{survey_id}
Frontend subscribes here to receive real-time campaign events.
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.ws_hub import hub

router = APIRouter(tags=['websocket'])


@router.websocket('/ws/campaigns/{survey_id}')
async def campaign_ws(survey_id: str, websocket: WebSocket):
    await websocket.accept()
    hub.connect(survey_id, websocket)
    try:
        while True:
            # Keep connection alive; client may send control messages in future
            data = await websocket.receive_text()
            # Currently no client→server messages defined; discard
            _ = data
    except WebSocketDisconnect:
        hub.disconnect(survey_id, websocket)
