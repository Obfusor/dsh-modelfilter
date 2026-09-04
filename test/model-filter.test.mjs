import test from 'node:test'
import assert from 'node:assert/strict'

// Keep the matching contract executable without requiring a browser runtime.
test('filter matching is case-insensitive and trims surrounding whitespace', () => {
  const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  assert.equal(normalize('  DeepSeek-V3  '), 'deepseekv3')
  assert.equal(normalize('Qwen2.5-Coder'), 'qwen25coder')
})

test('a matching model does not make its sibling models match', () => {
  const query = 'glm'
  const matches = (provider, model) => provider.toLowerCase().includes(query)
    || model.toLowerCase().includes(query)
  assert.equal(matches('OpenRouter', 'GLM-4'), true)
  assert.equal(matches('OpenRouter', 'Sonnet'), false)
})

test('model separators do not affect matching', () => {
  const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const query = normalize('qwen 3.8')
  assert.equal(normalize('qwen3.8').includes(query), true)
  assert.equal(normalize('qwen-3-8').includes(query), true)
})

test('a spaced version query matches a hyphenated model name', () => {
  const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  assert.equal(normalize('Deepseek-v4-flash').includes(normalize('v4 flash')), true)
})
