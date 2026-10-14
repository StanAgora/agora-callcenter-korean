from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8', extra='ignore')

    database_url: str = 'sqlite+aiosqlite:///./dev.db'
    anthropic_api_key: str = ''
    agora_api_key: str = ''
    agora_conversational_api_key: str = ''
    agora_conversational_base_url: str = 'https://api.agora.io/conversational-ai/v2'
    agora_project_id: str = '473b3dbdc2794138bd4469e9a02d9d59'
    agora_pipeline_id: str = '367139eca6ee44fc9eb26232d3da210e'
    agora_phone_number: str = '031186778285'
    voice_agent_base_url: str = 'http://localhost:9000'
    voice_agent_api_key: str = ''
    webhook_secret: str = 'changeme'
    poll_interval_seconds: int = 5
    max_concurrent_calls: int = 10
    openai_api_key: str = ''
    quota_transcript_model: str = 'gpt-4o-mini'
    quota_transcript_min_confidence: float = 0.5
    structured_output_poll_interval_seconds: int = 20
    structured_output_poll_batch_size: int = 80
    quota_transcript_eval_poll_interval_seconds: int = 20
    quota_transcript_eval_poll_batch_limit: int = 200


settings = Settings()
