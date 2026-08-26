import { spawn } from 'node:child_process';

import { ServiceError } from '../errors.js';
import { assertText, configuredStatus, isExecutable } from './common.js';
import { languageLabel } from '../languages.js';

function parseJsonEvents(output) {
  const chunks = [];
  for (const line of output.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed);
      if (event?.type === 'text' && typeof event.part?.text === 'string') chunks.push(event.part.text);
    } catch {
      // Ignore non-JSON diagnostic lines; opencode diagnostics normally go to stderr.
    }
  }
  return chunks.join('');
}

export function parseOpencodeOutput(output) {
  const jsonText = parseJsonEvents(output).trim();
  if (jsonText) return jsonText;
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) || '';
}

export class OpencodeBackend {
  constructor(config) {
    this.config = config;
  }

  id() {
    return 'opencode';
  }

  model() {
    return 'opencode';
  }

  status() {
    return isExecutable(this.config.bin)
      ? configuredStatus(true)
      : configuredStatus(false, `找不到可执行文件: ${this.config.bin}`);
  }

  async translate({ text, sourceLanguage = 'auto', targetLanguage = 'zh-CN' }) {
    assertText(text, this.config.maxTextChars);
    if (!isExecutable(this.config.bin)) {
      throw new ServiceError(`找不到 opencode 可执行文件: ${this.config.bin}`, {
        code: 'backend_unavailable',
        status: 503,
      });
    }
    const prompt = [
      'You are a translation engine.',
      `Translate the text from ${languageLabel(sourceLanguage)} to ${languageLabel(targetLanguage)}.`,
      'Return only the translated text, without explanations, notes, or quotation marks.',
      'Preserve line breaks, whitespace, and formatting where possible.',
      '',
      '<text>',
      text,
      '</text>',
    ].join('\n');
    const args = ['run', '--pure', '--format', 'json'];
    if (this.config.model) args.push('--model', this.config.model);
    if (this.config.dir) args.push('--dir', this.config.dir);
    args.push('--', prompt);
    const output = await this.run(args);
    const translated = parseOpencodeOutput(output);
    if (!translated) {
      throw new ServiceError('opencode 未返回翻译结果', {
        code: 'empty_translation',
        status: 502,
      });
    }
    return translated;
  }

  run(args) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.bin, args, {
        cwd: this.config.dir || process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      });
      let stdout = '';
      let stderr = '';
      let settled = false;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish(new ServiceError('opencode 请求超时', {
          code: 'upstream_timeout',
          status: 504,
          retryable: true,
        }));
      }, this.config.timeoutMs);

      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
      child.on('error', (error) => {
        finish(new ServiceError(`启动 opencode 失败: ${error.message}`, {
          code: 'backend_unavailable',
          status: 503,
        }));
      });
      child.on('close', (code, signal) => {
        if (code === 0) return finish(undefined, stdout);
        const diagnostic = stderr.trim().split(/\r?\n/u).slice(-1)[0];
        finish(new ServiceError(diagnostic ? `opencode 执行失败: ${diagnostic}` : `opencode 执行失败（code=${code}, signal=${signal || 'none'}）`, {
          code: 'upstream_error',
          status: 502,
          retryable: true,
        }));
      });
    });
  }
}
