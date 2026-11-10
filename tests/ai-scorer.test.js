'use strict';
const assert = require('node:assert/strict');
const { extractText } = require('../ai_scorer');

assert.equal(extractText({ output_text: '{"ok":true}' }), '{"ok":true}');
assert.equal(extractText({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{"pick":1}' }] }] }), '{"pick":1}');
assert.equal(extractText({ output: [] }), '');
console.log('OK — extraction des réponses OpenAI');
