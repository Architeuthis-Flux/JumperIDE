/*
 * Self-check that the clang-format WASM formatter reformats Arduino code.
 * Run: node scripts/clang_format.test.mjs
 *
 * Uses the package's Node entry (the browser wrapper in src/clang_format.mjs
 * self-hosts the same .wasm via an explicit URL). Validates the dependency and
 * the LLVM/2-space style applied by the Format button.
 */
import assert from 'node:assert/strict'
// The Node entry auto-initializes the WASM on import (no init() call needed).
// The browser wrapper in src/clang_format.mjs lazily inits the same .wasm.
import { format } from '@wasm-fmt/clang-format/node'

const messy = 'void setup(){int x=1;if(x){Serial.begin(9600);}}\nvoid loop(){}\n'
const formatted = format(messy, 'main.cpp', '{BasedOnStyle: LLVM, IndentWidth: 2, ColumnLimit: 100}')

assert.notEqual(formatted, messy, 'formatter changed the messy source')
assert.match(formatted, /void setup\(\) \{/, 'brace spacing normalized')
assert.match(formatted, /\n {2}int x = 1;/, '2-space indent applied')
assert.match(formatted, /void loop\(\) \{\}/, 'empty loop kept on its own line')

console.log('  ok clang-format reformats Arduino source (LLVM, 2-space)')
console.log('\nclang-format check passed.')
