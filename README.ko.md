# Gemini CLI — Bring Your Own LLM

[English](README.md) | **한국어**

[Google Gemini CLI](https://github.com/google-gemini/gemini-cli) 포크로,
**OpenAI 호환 LLM이면 무엇이든** 사용할 수 있습니다 — 사내 vLLM, OpenRouter,
OpenAI, Anthropic 등.

```
$ gemini
  > GLM-5-Thinking          (on-prem, 157K context)
    Kimi-K2.5-Non-Thinking   (on-prem, 262K context)
    dev-DeepSeek-V3.2        (OpenRouter)
    gpt-5                    (OpenAI)
    ...
```

모델을 선택하고 바로 코딩을 시작하세요.

---

## 설치 (5분)

### 1단계: Node.js 설치

**Node.js 20 이상**이 필요합니다. 확인:

```bash
node --version   # v20.x.x 이상이어야 합니다
```

설치가 안 되어 있으면 팀 리드에게 문의하거나
[nvm](https://github.com/nvm-sh/nvm)으로 설치하세요:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 20
```

> **사내망에서?** `npm install` 전에 `npm config set strict-ssl false`가 필요할
> 수 있습니다.

### 2단계: 클론 및 설치

```bash
git clone https://github.com/Taekyo-Lee/gemini-cli-fork.git
cd gemini-cli-fork
npm install --ignore-scripts
```

### 3단계: `.env` 설정

템플릿을 복사하고 값을 채우세요:

```bash
cp .env.example .env
```

`.env`를 편집기로 열어 아래 항목을 입력하세요:

| 변수                 | 입력할 값                                                | 필수 여부 |
| -------------------- | -------------------------------------------------------- | --------- |
| `GEMINI_FORK_DIR`    | 이 저장소 경로 (설치 스크립트가 자동 설정)               | 자동      |
| `OPENAI_API_KEY`     | OpenAI API 키 (`sk-...`)                                 | OpenAI 사용 시 |
| `ANTHROPIC_API_KEY`  | Anthropic API 키 (`sk-ant-...`)                          | Anthropic 사용 시 |
| `OPENROUTER_API_KEY` | OpenRouter API 키 (`sk-or-...`)                          | OpenRouter 사용 시 |
| `A2G_LOCATION`       | 환경: `CORP`, `DEV`, 또는 `HOME`                         | 필수      |
| `AD_ID`              | AD 계정명 (예: `hong.gildong`)                           | CORP만    |
| `FALLBACK_API_KEY_1` | 사내 인증 토큰 (`system_name/dep_ticket`)                | CORP만    |
| `LANGFUSE_*`         | Langfuse 트레이싱 키 ([텔레메트리](#텔레메트리) 참조)    | 선택      |

> **참고:** `*_API_BASE` URL은 필요 없습니다. 베이스 URL은 각 모델의
> `config/models.default.json` 설정에서 가져옵니다. 여기에는 API 키만 넣으세요.

**`A2G_LOCATION`은 뭘로 설정하나요?**

- **`CORP`** — 사내망에서 온프레미스 모델 사용 (GLM-5, Kimi, Qwen 등)
- **`DEV`** 또는 **`HOME`** — 공개 API 사용 (OpenAI, Anthropic, OpenRouter)

실제로 사용하는 제공자의 API 키만 있으면 됩니다. 예를 들어 사내 CORP 모델만
쓴다면 `OPENAI_API_KEY`는 필요 없습니다.

### 4단계: 빌드, 링크, 활성화

설치 스크립트 실행:

```bash
./scripts/fork/setup.sh
```

이 스크립트가 한 번에 모든 작업을 수행합니다:

1. 프로젝트 빌드
2. `gemini` 명령어를 전역으로 링크 (어떤 디렉토리에서든 사용 가능)
3. `.env`에 `GEMINI_FORK_DIR` 설정
4. `~/.bashrc`에 `.env` 소싱 추가 (모든 터미널에서 환경변수 자동 로드)

현재 터미널에 적용:

```bash
source ~/.bashrc
```

### 5단계: 실행

```bash
gemini
```

모델 선택 화면이 나타납니다. 모델을 선택하고 대화를 시작하세요.

**원샷 모드** (대화형 UI 없이):

```bash
gemini -p "이 에러 설명해줘" < error.log
```

**특정 모델 선택:**

```bash
gemini -m "GLM-5-Thinking"
gemini -m "gpt-5" -p "파이썬으로 hello world 작성해줘"
```

---

## 설치 후

### 업데이트

포크가 업데이트되었을 때:

```bash
cd $GEMINI_FORK_DIR
git pull
./scripts/fork/setup.sh
```

### 설치 확인

```bash
./scripts/fork/setup.sh --verify
```

빌드 존재 여부, `gemini` 명령어가 포크를 가리키는지, 버전 정보를 확인합니다.

### 삭제 (언인스톨)

```bash
./scripts/fork/uninstall.sh          # gemini 명령어 + bashrc 설정 제거
./scripts/fork/uninstall.sh --all    # ~/.gemini (설정, 대화 이력)도 함께 제거
```

저장소와 `node_modules/`는 유지됩니다 — 4단계부터 다시 실행하면 재설치됩니다:

```bash
./scripts/fork/setup.sh
source ~/.bashrc
```

`source ~/.bashrc`가 필요한 이유: `setup.sh`는 자식 프로세스에서 실행되므로
`~/.bashrc`에 환경변수 소싱 라인을 추가하지만 현재 터미널에는 로드할 수 없습니다.
1-3단계 (Node.js, 클론, npm install, .env)는 이미 완료되어 있으므로 건너뛸 수
있습니다.

### 코드 변경 후 재빌드

```bash
# 전체 재빌드 + 재링크:
./scripts/fork/setup.sh

# 빠른 재빌드만 (링크는 유지됨):
cd $GEMINI_FORK_DIR && npm run build
```

---

## 사용 가능한 모델

모델은 `config/models.default.json`에 정의되어 있습니다. 모델 선택 화면에는
현재 환경에서 사용 가능한 모델만 표시됩니다.

| 환경               | 모델                                                      | 제공자               |
| ------------------ | --------------------------------------------------------- | -------------------- |
| **CORP** (온프레미스) | GLM-5-Thinking, Kimi-K2.5, Qwen3.5, gpt-oss-120b, ...  | 방화벽 내부 vLLM     |
| **DEV / HOME**     | DeepSeek-V3.2, DeepSeek-R1, Claude-4-Sonnet, ...         | OpenRouter           |
| **전체**           | GPT-5, GPT-4.1, o3, o4-mini, Claude-4-Opus, ...          | OpenAI, Anthropic    |

---

## 텔레메트리

팀에서 자체 호스팅 [Langfuse](https://langfuse.com/) 인스턴스를 운영 중이라면
모든 LLM 호출을 자동으로 추적할 수 있습니다. **데이터가 외부로 나가지 않습니다.**

`.env`에 추가:

```bash
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_BASE_URL=http://localhost:3000
```

이것만으로 Langfuse 대시보드에 트레이스가 나타납니다. 키가 하나라도 빠져 있으면
텔레메트리는 자동으로 비활성화됩니다.

자세한 내용은 `docs/fork/tracing/telemetry.md`를 참고하세요.

---

## YOLO 모드 (자동 샌드박스)

Docker 샌드박스 안에서 도구를 자동 실행:

```bash
gemini --yolo
```

Docker가 없으면 크래시 없이 샌드박스 없이 계속 진행됩니다.

---

## Google Gemini 사용하기 (업스트림 모드)

`A2G_LOCATION`, `OPENROUTER_API_KEY`, `OPENAI_BASE_URL`을 설정하지 **않으면**
원래 Google 인증 흐름으로 동작합니다:

```bash
unset A2G_LOCATION OPENROUTER_API_KEY OPENAI_BASE_URL
gemini   # -> Google OAuth / API 키 / Vertex AI
```

---

## Python 연동

이 모델 레지스트리의 모델을 Python 코드에서 사용:

```python
import sys; sys.path.insert(0, f"{os.environ['GEMINI_FORK_DIR']}/scripts/fork")
from gemini_llm import from_model, list_models

list_models()                          # 현재 환경의 모델 목록
llm = from_model("GLM-5-Thinking")     # LangChain ChatOpenAI 인스턴스 생성
llm.invoke("안녕하세요")               # 사용
```

필요 패키지: `pip install langchain-openai`

---

## 문제 해결

### `gemini: command not found`

설치 스크립트를 다시 실행하세요:

```bash
cd /path/to/gemini-cli-fork
./scripts/fork/setup.sh
source ~/.bashrc
```

### `npm install` SSL 에러

사내망에서:

```bash
npm config set strict-ssl false
npm install --ignore-scripts
```

### 모델이 안 보이거나 잘못된 모델이 보임

`.env`의 `A2G_LOCATION` 값을 확인하세요:

```bash
echo $A2G_LOCATION   # CORP, DEV, 또는 HOME이 출력되어야 합니다
```

비어 있으면 `source ~/.bashrc`를 실행하거나 새 터미널을 여세요.

### API 키 에러

제공자에 맞는 키를 설정했는지 확인하세요. CLI는 모델의 URL을 기반으로 키를
읽습니다:

| 제공자 URL 포함      | 키 변수              |
| --------------------- | -------------------- |
| `anthropic.com`       | `ANTHROPIC_API_KEY`  |
| `openrouter.ai`       | `OPENROUTER_API_KEY` |
| 그 외 모두            | `OPENAI_API_KEY`     |

CORP 모델은 API 키가 필요 없습니다 — `AD_ID`와 `FALLBACK_API_KEY_1`을 사용합니다.

---

## 작동 원리

이 포크는 Gemini CLI의 `ContentGenerator` 인터페이스를 통해 연결됩니다:

```
시작 -> 환경 감지 -> 모델 선택 (포크) 또는 Google 인증 (업스트림)
                         |
                         v
             OpenAIContentGenerator
                  |         |
       openaiTypeMapper    OpenAI SDK
       (Gemini <> OpenAI)  (Chat Completions API)
                             |
                             v
                  호환 가능한 모든 엔드포인트
```

CLI의 나머지 부분 — 도구 실행, 프롬프트 구성, UI 렌더링 — 은 변경 없이 그대로
입니다. `ContentGenerator` 인터페이스를 소비하며 어떤 백엔드가 활성화되어 있는지
신경 쓰지 않습니다.

---

## 업스트림 업데이트

이 포크는 [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)의
안정 릴리스를 추적합니다. 최신 업스트림 버전과 동기화하려면:

```bash
# 1. 새 안정 릴리스가 있는지 확인
./scripts/fork/upstream-sync.sh

# 2. 새 버전이 있으면 머지
git merge <VERSION_TAG> --no-commit

# 3. 충돌 해결 후 빌드 및 테스트
npm install --ignore-scripts
npm run build
npm test

# 4. 포크 기능이 정상인지 확인
./scripts/fork/verify-fork-features.sh

# 5. 커밋
git commit -m "merge: sync with upstream <VERSION_TAG>"
```

동기화 스크립트가 최신 안정 태그를 자동 감지하고 머지 전 백업 태그를 생성합니다.
전체 가이드와 머지 이력은 `docs/fork/upstream/`을 참고하세요.

---

## 문서

| 경로                        | 내용                                         |
| --------------------------- | -------------------------------------------- |
| `docs/fork/overview/`       | 포크 철학, 포크 vs 업스트림 비교             |
| `docs/fork/setup/`          | 설치 가이드, 문제 해결                       |
| `docs/fork/architecture/`   | OpenAI 호환 모드, 모델 레지스트리            |
| `docs/fork/tracing/`        | 텔레메트리 설정, Langfuse 연동               |
| `docs/fork/upstream/`       | 동기화 가이드, 머지 이력                     |
| `docs/fork/tracking/`       | TODO, 변경 이력                              |

---

## 라이선스

[Apache License 2.0](LICENSE) — 업스트림과 동일.

업스트림: [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
