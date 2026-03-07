""" 

You can run this file by uv run --native-tls --active --env-file /home/jetlee/workspace/main/research/a2g_packages/envs/.env on_prem_llms_test/list_available_llms.py

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


from a2g_models import LLMRegistry
from a2g_models.loggers import a2g_models_console_logger

AVAILABLE_LLMS: list[str] = LLMRegistry.keys()

a2g_models_console_logger.info(f"Available LLMs: {AVAILABLE_LLMS}")
