import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../src/config/schema.js';

describe('ConfigSchema', () => {
  it('applies the default watchedExtensions values', () => {
    const config = ConfigSchema.parse({
      watchDir: '/tmp/watch',
      logFile: '/tmp/audit.jsonl',
      reviewDir: '/tmp/review',
    });

    expect(config.watchedExtensions).toEqual(['.txt', '.md']);
  });
});
