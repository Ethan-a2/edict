import { ServiceError } from './errors.js';
import { extractMessageContent } from './backends/common.js';
import { isChineseEnglishLanguage, normalizeLanguage, resolveChineseEnglishDirection } from './languages.js';

const backendAliases = new Map([
  ['youdao', 'youdao_web'],
  ['youdao-web', 'youdao_web'],
  ['youdao_web', 'youdao_web'],
  ['caiyun', 'caiyun'],
  ['builtinai', 'builtin_ai'],
  ['builtin-ai', 'builtin_ai'],
  ['builtin_ai', 'builtin_ai'],
  ['opencode', 'opencode'],
]);

export function normalizeBackend(value, fallback = 'youdao_web') {
  const raw = String(value || '').trim().toLowerCase();
  return backendAliases.get(raw) || fallback;
}

export function modelBackend(model, configuredBuiltinModel = '') {
  const normalized = normalizeBackend(model, '');
  if (normalized) return normalized;
  if (configuredBuiltinModel && model === configuredBuiltinModel) return 'builtin_ai';
  return undefined;
}

function textFromMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ServiceError('messages 必须是非空数组', { code: 'invalid_request', status: 400 });
  }
  const usable = messages.filter((message) => message?.role !== 'system');
  const message = [...(usable.length ? usable : messages)].reverse().find((item) => item?.content !== undefined);
  const text = extractMessageContent(message?.content);
  if (!text.trim()) {
    throw new ServiceError('messages 中没有可翻译的文本', { code: 'invalid_request', status: 400 });
  }
  return text;
}

function parsePrompt(text) {
  let sourceLanguage = 'auto';
  let targetLanguage = 'auto';
  let translationText = text;

  const xmlText = text.match(/<text>\s*([\s\S]*?)\s*<\/text>/iu);
  if (xmlText) translationText = xmlText[1];

  const fromTo = text.match(/translate\s+(?:the\s+)?(?:following\s+)?(?:text\s+)?from\s+([^\n:]+?)\s+to\s+([^\n:.：]+?)\s*(?:[.。:：]|\n)\s*([\s\S]*)/iu);
  if (fromTo) {
    sourceLanguage = normalizeLanguage(fromTo[1]);
    targetLanguage = normalizeLanguage(fromTo[2]);
    translationText = fromTo[3];
  } else {
    const into = text.match(/translate\s+(?:the\s+)?(?:following\s+)?(?:text\s+)?(?:into|to)\s+([^\n:.：]+?)\s*(?:[.。:：]|\n)\s*([\s\S]*)/iu);
    if (into) {
      targetLanguage = normalizeLanguage(into[1]);
      translationText = into[2];
    } else {
      const chinese = text.match(/(?:翻译|翻譯)(?:成|为|為|到)\s*([^：:\n]+)\s*[：:]\s*([\s\S]*)/u);
      if (chinese) {
        targetLanguage = normalizeLanguage(chinese[1]);
        translationText = chinese[2];
      }
    }
  }

  return {
    text: translationText,
    sourceLanguage,
    targetLanguage,
  };
}

export function parseTranslateRequest(body) {
  const request = body && typeof body === 'object' ? body : {};
  const text = request.text ?? request.input;
  if (typeof text !== 'string' || !text.trim()) {
    throw new ServiceError('text 必须是非空字符串', { code: 'invalid_request', status: 400 });
  }
  const direction = resolveChineseEnglishDirection(
    text,
    request.source_language ?? request.sourceLanguage ?? request.from,
    request.target_language ?? request.targetLanguage ?? request.to,
  );
  if (!isChineseEnglishLanguage(direction.sourceLanguage) || !isChineseEnglishLanguage(direction.targetLanguage)) {
    throw new ServiceError('edict 目前只支持中文和英文互译', { code: 'unsupported_language', status: 400 });
  }
  return {
    backend: request.backend || request.service ? normalizeBackend(request.backend ?? request.service, '') : undefined,
    model: request.model,
    text,
    sourceLanguage: direction.sourceLanguage,
    targetLanguage: direction.targetLanguage,
  };
}

export function parseChatRequest(body) {
  const request = body && typeof body === 'object' ? body : {};
  const prompt = textFromMessages(request.messages);
  const parsedPrompt = parsePrompt(prompt);
  const metadata = request.metadata && typeof request.metadata === 'object' ? request.metadata : {};
  const direction = resolveChineseEnglishDirection(
    request.text ?? parsedPrompt.text,
    request.source_language ?? request.sourceLanguage ?? request.from ?? metadata.source_language ?? parsedPrompt.sourceLanguage,
    request.target_language ?? request.targetLanguage ?? request.to ?? metadata.target_language ?? parsedPrompt.targetLanguage,
  );
  if (!isChineseEnglishLanguage(direction.sourceLanguage) || !isChineseEnglishLanguage(direction.targetLanguage)) {
    throw new ServiceError('edict 目前只支持中文和英文互译', { code: 'unsupported_language', status: 400 });
  }
  return {
    backend: request.backend || request.service ? normalizeBackend(request.backend ?? request.service, '') : undefined,
    model: request.model || undefined,
    text: request.text ?? parsedPrompt.text,
    sourceLanguage: direction.sourceLanguage,
    targetLanguage: direction.targetLanguage,
    stream: request.stream === true,
  };
}

export function makeChatResponse({ id, model, text, created }) {
  return {
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content: text },
        finish_reason: 'stop',
      },
    ],
  };
}
