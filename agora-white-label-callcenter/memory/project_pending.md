---
name: 待确定事项
description: 项目中尚未确定的技术方案，需后续跟进
type: project
---

## Voice Agent 集成（待定）

**待确定 1：Voice Agent API 规范**
- 接口地址、认证方式、请求/响应格式尚未确定
- 当前代码中 `voice_agent.py` 为占位适配器（httpx stub）
- **How to apply:** 确定后替换 `backend/app/services/voice_agent.py` 的实现即可，其余代码无需改动

**待确定 2：Voice Agent 结构化输出格式**
- 通话结束后 Voice Agent 回传的 structured output 字段格式尚未确定
- 当前 `callbacks.py` 接收 `responses: dict` 为任意键值
- 需配合 Structured Output Schema（已在 Prompt Editor 页面生成）对齐
- **How to apply:** 确定后更新 `callback.py` schema 及 `_handle_call_result()` 逻辑
