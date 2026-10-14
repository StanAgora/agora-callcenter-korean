from pydantic import BaseModel


class CallResultCallback(BaseModel):
    """Payload sent by Voice Agent after a call finishes."""
    call_id: str
    phone: str
    result_code: int
    responses: dict = {}
