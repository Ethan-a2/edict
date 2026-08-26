# Translation Service

一个独立的本地翻译网关，把 Easydict 中的 Youdao Web、Caiyun、BuiltInAI，以及本机 `opencode` CLI 统一成 OpenAI-compatible 接口，并提供一个直接可用的 CLI。

原始 `pot-desktop` 和 `Easydict` 仓库不会被修改。本项目也不会读取或复制 Easydict 中的内置密钥；Caiyun 和 BuiltInAI 必须配置你自己的凭证。

## 支持后端

| 后端 ID | 模型 ID | 凭证 | 说明 |
| --- | --- | --- | --- |
| `youdao_web` | `youdao-web` | 不需要 | 复用 Easydict 的 Youdao Web 动态 key + AES-128-CBC 流程；这是非官方 Web 接口，可能随网站变更 |
| `caiyun` | `caiyun` | `CAIYUN_TOKEN` | Caiyun LingoCloud 文本翻译接口 |
| `builtin_ai` | `builtin-ai` | `BUILTIN_AI_ENDPOINT`、`BUILTIN_AI_API_KEY` | 任何 OpenAI-compatible Chat Completions 服务；默认模型为 `glm-4-flash-250414` |
| `opencode` | `opencode` | `opencode` 自身配置 | 无 shell 调用 `opencode run --format json`，解析 JSON 事件中的文本结果 |

## 安装和启动

要求 Node.js 20 或更新版本；项目无第三方运行时依赖。

```bash
cp .env.example .env
# 编辑 .env，至少按需设置 CAIYUN_TOKEN、BUILTIN_AI_* 等配置
npm start
```

默认监听 `127.0.0.1:8787`。也可以：

```bash
node bin/translate-service.js serve --host 127.0.0.1 --port 8787
```

服务默认只监听本机。若要暴露到其他机器，建议同时设置 `TRANSLATION_SERVICE_AUTH_TOKEN`，并在反向代理层启用 TLS。

## CLI

CLI 通过后台服务调用，不会绕过统一协议：

```bash
translate-service translate --backend youdao_web --from en --to zh hello
echo hello | translate-service translate --backend caiyun --from en --to zh
translate-service models
translate-service health
```

如果没有执行 `npm link`，可直接使用：

```bash
node bin/translate-service.js translate --backend opencode --from en --to zh hello
```

服务地址和认证令牌：

```bash
translate-service translate \
  --server http://127.0.0.1:8787 \
  --auth-token "$TRANSLATION_SERVICE_AUTH_TOKEN" \
  --backend builtin_ai --from en --to zh hello
```

## OpenAI-compatible API

### 专用翻译接口

```bash
curl http://127.0.0.1:8787/v1/translate \
  -H 'Content-Type: application/json' \
  -d '{
    "backend": "youdao_web",
    "source_language": "en",
    "target_language": "zh-CN",
    "text": "hello"
  }'
```

返回：

```json
{
  "backend": "youdao_web",
  "model": "youdao-web",
  "text": "你好",
  "source_language": "en",
  "target_language": "zh-CN"
}
```

### Chat Completions

这个接口可以直接作为许多现有 OpenAI 客户端的 `base_url` 使用：

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "youdao-web",
    "messages": [
      {
        "role": "user",
        "content": "Translate into Simplified Chinese:\nhello"
      }
    ],
    "stream": false
  }'
```

也可以显式写服务元数据，避免依赖 prompt 识别：

```json
{
  "model": "caiyun",
  "backend": "caiyun",
  "source_language": "en",
  "target_language": "zh-CN",
  "messages": [{"role": "user", "content": "hello"}]
}
```

`stream: true` 会以标准 SSE 返回一个完整翻译结果的单个内容 chunk。另有 `GET /v1/models` 和无需认证的 `GET /healthz`。

### Python OpenAI 客户端示例

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8787/v1", api_key="local")
result = client.chat.completions.create(
    model="youdao-web",
    messages=[{"role": "user", "content": "Translate into Simplified Chinese: hello"}],
)
print(result.choices[0].message.content)
```

### 认证

设置 `TRANSLATION_SERVICE_AUTH_TOKEN` 后，除 `/healthz` 外的请求都需要以下任一形式：

```http
Authorization: Bearer <token>
```

或：

```http
X-API-Key: <token>
```

## 配置

复制 `.env.example` 为 `.env`。环境变量优先级高于 `.env`：

- `CAIYUN_TOKEN`：Caiyun 自己申请的 token。
- `BUILTIN_AI_ENDPOINT`：可以填写完整的 `/v1/chat/completions`，也可以填写 base URL。
- `BUILTIN_AI_API_KEY`：对应 OpenAI-compatible 服务的 API key。
- `BUILTIN_AI_MODEL`：上游实际模型，默认 `glm-4-flash-250414`。
- `OPENCODE_BIN`：可执行文件路径或 PATH 中的命令名，默认 `opencode`。
- `OPENCODE_MODEL`：可选，格式遵循 `opencode run --model`；为空时使用 opencode 自己的默认模型/提供商。
- `OPENCODE_DIR`：可选，传给 opencode 的工作目录。
- `TRANSLATION_SERVICE_TIMEOUT_MS`、`OPENCODE_TIMEOUT_MS`：上游超时时间。

## 验证

```bash
npm test
translate-service health
translate-service translate --backend youdao_web --from en --to zh hello
translate-service translate --backend opencode --from en --to zh hello
```

`/healthz` 和 `/v1/models` 会明确列出每个后端是否已配置/可执行。Caiyun、BuiltInAI 的“可用”需要你提供自己的凭证；本项目不会使用 Easydict 的私有内置 token。

## 安全和兼容性说明

- Youdao Web 是对 Easydict 当前 Web 流程的兼容实现，不是 Youdao 官方开放 API；请遵守目标站点的服务条款和访问限制。
- `opencode` 使用 `child_process.spawn` 的参数数组并关闭 shell，翻译文本不会被当作 shell 命令执行。
- 不要把 `.env`、API key、Caiyun token 或 opencode 的凭证提交到 Git。
- 默认限制翻译文本长度为 20,000 字符，防止误用导致上游请求过大。
