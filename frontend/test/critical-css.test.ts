import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
// @ts-expect-error a plain js build script, no types
import { criticalCss } from '../scripts/critical-css.js'

describe('criticalCss', () => {
  test('keeps rules whose classes the page uses, drops the rest', () => {
    const out = criticalCss('.flex{display:flex}.grid{display:grid}', '<div class="flex">')
    assert.equal(out, '.flex{display:flex}')
  })

  test('reads escaped class names the way the markup writes them', () => {
    const used = '<div class="md:grid-cols-2 [&_svg]:size-4 w-1/2">'
    const out = criticalCss('.md\\:grid-cols-2{a:1}.\\[\\&_svg\\]\\:size-4 svg{b:2}.w-1\\/2{c:3}.\\31 0{d:4}', used)
    assert.equal(out, '.md\\:grid-cols-2{a:1}.\\[\\&_svg\\]\\:size-4 svg{b:2}.w-1\\/2{c:3}')
  })

  test('a hex escape is a code point: .\\31 0 is the class "10"', () => {
    assert.equal(criticalCss('.\\31 0{a:1}', 'class="10"'), '.\\31 0{a:1}')
  })

  test('a selector needs every class it names', () => {
    const css = '.card .title{a:1}'
    assert.equal(criticalCss(css, 'class="title"'), '')
    assert.equal(criticalCss(css, 'class="card title"'), css)
  })

  test('trims a selector list to the selectors in use', () => {
    assert.equal(criticalCss('.gone,.kept{x:1}', 'kept'), '.kept{x:1}')
  })

  test('a substring test: a class hidden inside another word stays (errs towards keeping)', () => {
    assert.equal(criticalCss('.a{x:1}', 'class="b"'), '.a{x:1}')
  })

  test('removes blocks left empty, keeps @layer order, keyframes and rules without classes', () => {
    const css = '@layer theme,base;@media (min-width:40rem){.unused{a:1}}@keyframes spin{from{b:2}to{b:3}}:root{--c:4}'
    assert.equal(criticalCss(css, ''), '@layer theme,base;@keyframes spin{from{b:2}to{b:3}}:root{--c:4}')
  })
})
