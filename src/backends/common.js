import fs from 'node:fs';
import path from 'node:path';

import { ServiceError } from '../errors.js';

export function configuredStatus(configured, unavailableReason) {
  return configured
    ? { available: true }
    : { available: false, reason: unavailableReason };
}

export function disabledStatus() {
  return { available: false, enabled: false, reason: '后端已在配置中禁用' };
}

export function isExecutable(command) {
  if (!command) return false;
  if (command.includes(path.sep)) {
    try {
      fs.accessSync(command, fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  }
  const pathEntries = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return pathEntries.some((entry) => {
    try {
      fs.accessSync(path.join(entry, command), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

export function assertText(text, maxTextChars) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new ServiceError('翻译文本不能为空', { code: 'invalid_request', status: 400 });
  }
  if (text.length > maxTextChars) {
    throw new ServiceError(`翻译文本超过长度限制（最多 ${maxTextChars} 个字符）`, {
      code: 'text_too_long',
      status: 413,
    });
  }
}

export function extractMessageContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part?.type === 'text' && typeof part.text === 'string') return part.text;
      return '';
    })
    .join('');
}

export function extractAssistantContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (typeof part === 'string' ? part : typeof part?.text === 'string' ? part.text : ''))
    .join('');
}
