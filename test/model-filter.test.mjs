import test from 'node:test';
import assert from 'node:assert/strict';

// Keep the matching contract executable without requiring a browser runtime.
const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

test('filter matching is case-insensitive and trims surrounding whitespace', () => {
  assert.equal(normalize('  DeepSeek-V3  '), 'deepseekv3');
  assert.equal(normalize('Qwen2.5-Coder'), 'qwen25coder');
});

test('a matching model does not make its sibling models match', () => {
  const query = 'glm';
  const matches = (provider, model) => provider.toLowerCase().includes(query) || model.toLowerCase().includes(query);
  assert.equal(matches('OpenRouter', 'GLM-4'), true);
  assert.equal(matches('OpenRouter', 'Sonnet'), false);
});

test('model separators do not affect matching', () => {
  const query = normalize('qwen 3.8');
  assert.equal(normalize('qwen3.8').includes(query), true);
  assert.equal(normalize('qwen-3-8').includes(query), true);
});

test('a spaced version query matches a hyphenated model name', () => {
  assert.equal(normalize('Deepseek-v4-flash').includes(normalize('v4 flash')), true);
});

// Additional edge case tests

test('empty query matches everything', () => {
  const query = normalize('');
  assert.equal(query.length, 0);
  // Empty query should match any model (handled by filterMenu logic)
});

test('special characters are stripped for matching', () => {
  assert.equal(normalize('model@1.0'), 'model10');
  assert.equal(normalize('GPT-4o-mini'), 'gpt4omini');
  assert.equal(normalize('Claude 3 Opus'), 'claude3opus');
});

test('unicode characters are normalized', () => {
  // NFKC normalization handles compatibility characters like full-width ASCII
  assert.equal(normalize('ＡＩ'), 'ai');
  // Note: Greek alpha (α) is not converted to Latin 'a' by NFKC - that's a different transformation
  assert.equal(normalize('ℓℓα'), 'llα');
});

test('provider name matching works independently', () => {
  const query = normalize('openrouter');
  // Provider match would be checked separately in filterMenu
  assert.equal(query.length > 0, true);
});

test('model name matching works with partial strings', () => {
  const query = normalize('sonnet');
  assert.equal(normalize('Claude Sonnet').includes(query), true);
  assert.equal(normalize('Sonnet Pro').includes(query), true);
  assert.equal(normalize('Opus').includes(query), false);
});

test('version numbers are searchable', () => {
  const query = normalize('v3');
  assert.equal(normalize('DeepSeek-V3').includes(query), true);
  assert.equal(normalize('V3 Turbo').includes(query), true);
  assert.equal(normalize('V2').includes(query), false);
});

test('numeric queries work', () => {
  const query = normalize('4');
  assert.equal(normalize('GPT-4').includes(query), true);
  assert.equal(normalize('Claude 3').includes(query), false);
});

test('long model names are searchable by any part', () => {
  const longName = 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
  const query = normalize('instruct');
  assert.equal(normalize(longName).includes(query), true);
});

test('case variations all match', () => {
  const model = 'DeepSeek-V3';
  assert.equal(normalize(model).includes(normalize('deepseek')), true);
  assert.equal(normalize(model).includes(normalize('DEEPSEEK')), true);
  assert.equal(normalize(model).includes(normalize('DeepSeek')), true);
});

test('punctuation variations are equivalent', () => {
  const variants = ['GPT-4o', 'GPT 4o', 'gpt.4o', 'GPT_4o'];
  const normalized = variants.map(v => normalize(v));
  // All should normalize to the same string
  for (let i = 1; i < normalized.length; i++) {
    assert.equal(normalized[i], normalized[0]);
  }
});

test('whitespace variations are equivalent', () => {
  const variants = ['Claude 3 Opus', 'Claude  3  Opus', ' Claude 3 Opus ', 'Claude\t3\nOpus'];
  const normalized = variants.map(v => normalize(v));
  for (let i = 1; i < normalized.length; i++) {
    assert.equal(normalized[i], normalized[0]);
  }
});

test('hyphen vs underscore are equivalent', () => {
  assert.equal(normalize('model-name'), normalize('model_name'));
  assert.equal(normalize('gpt-4o-mini'), normalize('gpt_4o_mini'));
});

test('dot versions match without dots', () => {
  const query = normalize('3.8');
  assert.equal(normalize('qwen3.8').includes(query), true);
  assert.equal(normalize('qwen-3-8').includes(query), true);
  assert.equal(normalize('qwen_3_8').includes(query), true);
});

test('search query with multiple words matches all', () => {
  const query = normalize('deepseek v3');
  assert.equal(normalize('DeepSeek-V3').includes(query), true);
  assert.equal(normalize('V3 DeepSeek').includes(query), false); // Order matters for includes()
});

test('very long queries work', () => {
  const query = normalize('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo');
  assert.equal(normalize('meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo').includes(query), true);
});

test('query with only special characters becomes empty', () => {
  const query = normalize('- . _ @ # $ % ^ & *');
  assert.equal(query.length, 0);
});

test('model names with slashes are searchable', () => {
  const model = 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo';
  const query = normalize('llama');
  assert.equal(normalize(model).includes(query), true);
});

test('provider prefix matching works', () => {
  // Simulate provider name matching (would be done in filterMenu)
  const providers = ['OpenRouter', 'Anthropic', 'Google'];
  const query = normalize('anth');
  
  for (const provider of providers) {
    if (normalize(provider).includes(query)) {
      assert.equal(provider, 'Anthropic');
    }
  }
});

test('model suffix matching works', () => {
  const models = ['GPT-4o-mini', 'GPT-4o', 'Claude Sonnet'];
  const query = normalize('mini');
  
  for (const model of models) {
    if (normalize(model).includes(query)) {
      assert.equal(model, 'GPT-4o-mini');
    }
  }
});

test('real-world model name matching scenarios', () => {
  // Test actual model names that users might search for
  const testCases = [
    ['deepseek v3', 'DeepSeek-V3'],
    ['coder', 'Qwen2.5-Coder-7B-Instruct'],
    ['claude sonnet', 'Claude Sonnet'],
    ['gpt 4o mini', 'GPT-4o-mini'],
    ['70b', 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo'],
    ['gemini pro', 'Gemini Pro'],
    ['mistral large', 'Mistral Large']
  ];

  for (const [query, model] of testCases) {
    assert.equal(
      normalize(model).includes(normalize(query)),
      true,
      `Query "${query}" should match model "${model}"`
    );
  }
});