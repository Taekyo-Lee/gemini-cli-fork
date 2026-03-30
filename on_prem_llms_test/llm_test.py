""" 

You can run this file by uv run --native-tls --active --env-file ~/.env on_prem_llms_test/llm_test.py 

"""

# /// script
# dependencies = [
#     "json5>=0.12.1",
#     "langchain>=1.2.10",
#     "langchain-community>=0.4.1",
#     "langchain-openai>=1.1.10",
#     "langchain-qdrant>=1.1.0",
#     "langchain-huggingface>=1.2.0",
#     "langchain-mcp-adapters>=0.2.1",
#     "langgraph>=1.0.8",
#     "langgraph-checkpoint-redis>=0.3.5",
#     "pillow>=12.0.0",
#     "filetype>=1.2.0",
#     "pytz>=2025.2",
#     "colorlog>=6.10.1",
#     "transformers>=4.57.3",
#     "langfuse>=3.11.2",
#     "torch>=2.9.1",
#     "torchvision>=0.24.1",
#     "torchaudio>=2.9.1",
#     "redis>=7.1.0",
#     "langchain-anthropic>=1.3.1",
#     "pytest>=9.0.2",
# ]
# ///


from a2g_models import ChatOpenAI, LLMRegistry
from a2g_models.loggers import a2g_models_console_logger

MODELS: list[str] = ['dev-claude-haiku-4.5']


def test_llm_invoke() -> None:
    a2g_models_console_logger.info("Starting test_llm_invoke")
    a2g_models_console_logger.debug(f"  LLMs: {LLMRegistry.keys()}")

    for model in MODELS:
        chat_model = ChatOpenAI.from_model(model)
        chat_model.info()

        query = 'hello'
        response = chat_model.invoke(query)
        assert response.content and isinstance(response.content, (str, list)), "Response content should be a non-empty string"
        if isinstance(response.content, str):
            a2g_models_console_logger.debug(f'  Model: {model}\nQuery: {query}\nResponse: {response.content}')
        else:
            for idx, output in enumerate(response.content):
                output_type = output.get('type', 'unknown')
                content = output.get('text', '') if output_type == 'text' else str(output)
                a2g_models_console_logger.debug(f'  Model: {model}\nQuery: {query}\nResponse {idx} - Type: {output_type}\nContent: {content}')
    print()


def learnings() -> None:
    pass


if __name__ == "__main__":
    test_llm_invoke()
    learnings()
    print('✅ All LLM tests passed!')
    print()
    print()
