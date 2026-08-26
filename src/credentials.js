import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const defaultSecretKeyFile = '/media/code/tools/Easydict/Easydict/Swift/Feature/DefaultAPIKeys/EncryptedSecretKeys.plist';

function decryptValue(value, bundleName) {
  const key = crypto.createHash('sha256').update(bundleName, 'utf8').digest('hex').slice(0, 16);
  const decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(key, 'utf8'), Buffer.from(key, 'utf8'));
  return Buffer.concat([decipher.update(Buffer.from(value, 'base64')), decipher.final()]).toString('utf8');
}

function parsePlist(contents, bundleName) {
  const values = {};
  for (const match of contents.matchAll(/<key>([^<]+)<\/key>\s*<string>([^<]*)<\/string>/gu)) {
    try {
      values[match[1]] = decryptValue(match[2], bundleName);
    } catch {
      values[match[1]] = '';
    }
  }
  return values;
}

function candidatePaths(configuredPath, rootPath) {
  const candidates = [configuredPath];
  if (rootPath) {
    candidates.push(path.join(rootPath, 'Easydict', 'Swift', 'Feature', 'DefaultAPIKeys', 'EncryptedSecretKeys.plist'));
    candidates.push(path.join(rootPath, 'Contents', 'Resources', 'EncryptedSecretKeys.plist'));
  }
  candidates.push(defaultSecretKeyFile);
  candidates.push('/Applications/Easydict.app/Contents/Resources/EncryptedSecretKeys.plist');
  return [...new Set(candidates.filter(Boolean))];
}

export function loadEasydictCredentials({ enabled = true, path: configuredPath = '', root = '', bundleName = 'Easydict' } = {}) {
  if (!enabled) return { values: {}, source: undefined };
  for (const candidate of candidatePaths(configuredPath, root)) {
    try {
      const values = parsePlist(fs.readFileSync(candidate, 'utf8'), bundleName);
      if (Object.values(values).some(Boolean)) return { values, source: candidate };
    } catch (error) {
      if (error.code !== 'ENOENT') continue;
    }
  }
  return { values: {}, source: undefined };
}
