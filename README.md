# edict

本地中英文翻译网关，兼容 Easydict 的 Youdao Web、Caiyun、BuiltInAI 和 `opencode`，并提供简单的 HTTP 词典查询接口。

项目位于 `/media/code/tools/edict`，不会修改 `pot-desktop` 或 `Easydict` 源码。

## 特性

- 只处理中文和英文：英文自动翻译成中文，中文自动翻译成英文。
- 输入尽可能简单，不需要传 `from`、`to`。
- 支持 Youdao Web、Caiyun、BuiltInAI、`opencode` 四个后端。
- 自动复用 Easydict 的加密默认凭证；明文只在进程内使用，不写入项目。
- 每个后端可以通过配置文件或环境变量启用/禁用。
- 提供 `/dicts/search`、`/dicts/youdao/search`、`/dicts/caiyun/search` 等 GET 接口。
- 同时保留 OpenAI-compatible `/v1/chat/completions` 和专用 `/v1/translate`。

## 启动

要求 Node.js 20 或更新版本：

```bash
cd /media/code/tools/edict
npm test
node bin/translate-service.js serve
```

默认监听 `http://127.0.0.1:8787`。

也可以指定配置文件：

```bash
node bin/translate-service.js serve --config /path/to/edict.config.json
```

如果希望直接安装命令：

```bash
npm link
edict serve
```

## 最简单的查询方式

默认使用配置中的 `defaultBackend`，默认值为 `caiyun`：

```bash
curl 'http://localhost:8787/dicts/search?q=hello'
curl 'http://localhost:8787/dicts/search?q=你好'
```

返回示例：

```json
{
  "query": "hello",
  "text": "你好",
  "translation": "你好",
  "backend": "caiyun",
  "model": "caiyun",
  "source_language": "en",
  "target_language": "zh-CN"
}
```

指定后端：

```bash
curl 'http://localhost:8787/dicts/youdao/search?q=hello'
curl 'http://localhost:8787/dicts/caiyun/search?q=hello'
curl 'http://localhost:8787/dicts/builtin-ai/search?q=hello'
curl 'http://localhost:8787/dicts/opencode/search?q=hello'
```

兼容的后端路径别名包括：

- `youdao`、`youdao_web`
- `caiyun`
- `builtin-ai`、`builtin_ai`
- `opencode`

`/dicts/search` 等接口只需要 `q` 参数；不传语言时自动判断中文/英文方向。也接受 `text` 作为 `q` 的别名。

## 配置后端

配置文件默认位置：

```text
./edict.config.json
```

可以从示例复制：

```bash
cp edict.config.example.json edict.config.json
```

示例：

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8787
  },
  "defaultBackend": "caiyun",
  "credentials": {
    "easydict": {
      "enabled": true,
      "path": "/media/code/tools/Easydict/Easydict/Swift/Feature/DefaultAPIKeys/EncryptedSecretKeys.plist",
      "bundleName": "Easydict"
    }
  },
  "backends": {
    "youdao_web": { "enabled": true },
    "caiyun": { "enabled": true },
    "builtin_ai": {
      "enabled": true,
      "endpoint": "http://127.0.0.1:11435/chat/completions",
      "model": "Qwen3.5-2B"
    },
    "opencode": { "enabled": true, "dir": "/tmp" }
  }
}
```

后端禁用后，健康检查和模型列表会标记为不可用，调用会返回 `503 backend_disabled`。

### 本地 Qwen3.5-2B

`Qwen3.5-2B` 可以直接复用 `builtin_ai` 这个 OpenAI-compatible 后端。由于本地服务的接口是 `/chat/completions` 而不是 `/v1/chat/completions`，配置时填完整地址：

```json
{
  "defaultBackend": "builtin_ai",
  "backends": {
    "builtin_ai": {
      "enabled": true,
      "endpoint": "http://127.0.0.1:11435/chat/completions",
      "model": "Qwen3.5-2B"
    }
  }
}
```

本地 Qwen 服务不要求 API Key；`BUILTIN_AI_API_KEY` 可以留空。远程 OpenAI-compatible 服务仍可填写 API Key，适配器只会在配置了 Key 时发送 `Authorization` 请求头。配置后，`Qwen3.5-2B` 会出现在 `/v1/models`，并可直接作为 Chat Completions 的 `model` 值。

### Easydict 凭证复用

默认会尝试读取并解密：

```text
/media/code/tools/Easydict/Easydict/Swift/Feature/DefaultAPIKeys/EncryptedSecretKeys.plist
```

支持的默认凭证包括：

- `caiyunToken`
- `builtInAIAPIKey`
- `builtInAIEndpoint`

如果不希望复用：

```json
{
  "credentials": {
    "easydict": { "enabled": false }
  }
}
```

也可以用环境变量关闭或指定位置：

```bash
EDICT_REUSE_EASYDICT_CREDENTIALS=false
EASYDICT_SECRET_KEYS_PATH=/path/to/EncryptedSecretKeys.plist
EASYDICT_BUNDLE_NAME=Easydict
```

显式配置优先于自动发现的凭证：

```bash
CAIYUN_TOKEN='your-token'
BUILTIN_AI_ENDPOINT='https://your-openai-compatible-host/v1'
BUILTIN_AI_API_KEY='your-api-key'
BUILTIN_AI_MODEL='Qwen3.5-2B'
```

不要把明文凭证写进 Git。`.env` 和 `edict.config.json` 已加入 `.gitignore`。

### 环境变量启停

每个后端也可以通过环境变量启停：

```bash
YOUDAO_ENABLED=false
CAIYUN_ENABLED=true
BUILTIN_AI_ENABLED=false
OPENCODE_ENABLED=true
```

环境变量优先于配置文件。

## CLI

CLI 默认也自动识别中英文方向：

```bash
edict translate hello
edict translate 你好
```

指定后端：

```bash
edict translate --backend youdao_web hello
edict translate --backend caiyun hello
edict translate --backend opencode 你好
```

从 stdin 读取：

```bash
echo hello | edict translate --backend caiyun
```

查看后端状态：

```bash
edict health
edict models
```

仍然可以显式指定语言，但一般不需要：

```bash
edict translate --from en --to zh hello
```

## OpenAI-compatible API

### Chat Completions

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "youdao-web",
    "messages": [{"role": "user", "content": "hello"}]
  }'
```

请求没有显式语言时，同样按中文/英文自动判断。也可以指定：

```json
{
  "model": "caiyun",
  "source_language": "en",
  "target_language": "zh-CN",
  "messages": [{"role": "user", "content": "hello"}]
}
```

使用本地 `Qwen3.5-2B` 时，先启动服务：

```bash
node bin/translate-service.js serve --config /path/to/edict.config.json
```

然后通过 edict 的 `8787` 端口调用，不要直接把业务请求发到模型端口 `11435`：

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "Qwen3.5-2B",
    "messages": [{"role": "user", "content": "The local translation gateway preserves the original paragraph structure. It automatically detects whether the input is Chinese or English.\n\nThis makes it convenient to translate documentation without changing the surrounding formatting."}]
  }'
```

反向翻译只需把 `messages[0].content` 换成中文段落；服务会根据文本自动选择 `en -> zh-CN` 或 `zh-CN -> en`。也可以用专用接口显式选择后端：

```bash
curl http://127.0.0.1:8787/v1/translate \
  -H 'Content-Type: application/json' \
  -d '{"backend":"builtin_ai","text":"本地翻译网关会保留原始段落结构。"}'
```

支持 `stream: true`，返回标准 SSE。

### 专用接口

```bash
curl http://127.0.0.1:8787/v1/translate \
  -H 'Content-Type: application/json' \
  -d '{"backend":"youdao_web","text":"hello"}'
```

### 健康和模型列表

```bash
curl http://127.0.0.1:8787/healthz
curl http://127.0.0.1:8787/v1/models
```

## 认证

默认只监听本机。如果需要通过网络访问，设置：

```bash
TRANSLATION_SERVICE_AUTH_TOKEN='local-secret'
```

调用时传：

```bash
curl 'http://127.0.0.1:8787/dicts/search?q=hello' \
  -H 'Authorization: Bearer local-secret'
```

`/healthz` 不要求认证；其他接口需要 `Authorization: Bearer ...` 或 `X-API-Key`。

## 当前验证

在当前机器上已验证：

- Youdao Web：可用，`hello -> 你好`、`你好 -> Hello`。
- Caiyun：使用自动发现的 Easydict 凭证可用，`hello -> 你好`。
- BuiltInAI：自动发现的 endpoint/key 可发起请求，但当前上游返回 HTTP 429，属于上游限流，不是本地配置缺失。
- `opencode`：可用，默认在 `/tmp` 运行以避免扫描 `edict` 仓库，真实调用 `hello -> 你好` 成功；可通过 `OPENCODE_MODEL`、`OPENCODE_DIR` 覆盖。
- `Qwen3.5-2B`：2026-08-31 通过 `http://127.0.0.1:11435/chat/completions` 实测，英文段落和中文段落双向翻译成功；返回中的 `<think>...</think>` 思考块会被适配器剥离。
- 自动化测试：16 项全部通过。

实测请求结果（省略动态的 `id` 和 `created` 字段）：

英文段落 -> 中文：

```text
本地翻译网关保持原始段落结构。它自动检测输入是否为中文或英文，然后将文本发送至配置的模型。

这使得在不改变周围格式的情况下翻译文档变得方便。
```

中文段落 -> English：

```text
The local translation gateway preserves the original paragraph structure and automatically determines whether the input is Chinese or English.

This allows for convenient translation of technical documents without altering the surrounding formatting.
```

Youdao Web 是对 Easydict 当前 Web 流程的兼容实现，属于非官方 Web 接口，可能随目标站点变化。
