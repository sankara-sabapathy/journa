import { describe, expect, it } from 'vitest'
import { applyMarkdownFormat } from './formatText'

describe('applyMarkdownFormat', () => {
  it('wraps a selection in bold markers', () => {
    expect(applyMarkdownFormat('hello ', 'world', '', 'bold')).toEqual({
      text: 'hello **world**',
      selectStart: 8,
      selectEnd: 13,
    })
  })

  it('inserts empty markers with the cursor between them', () => {
    expect(applyMarkdownFormat('ab', '', 'cd', 'italic')).toEqual({
      text: 'ab**cd',
      selectStart: 3,
      selectEnd: 3,
    })
  })

  it('unwraps an already-bold selection on second press', () => {
    expect(applyMarkdownFormat('', '**world**', '', 'bold')).toEqual({
      text: 'world',
      selectStart: 0,
      selectEnd: 5,
    })
  })

  it('prefixes every touched line with a quote marker', () => {
    expect(applyMarkdownFormat('a\n', 'b\nc', '\nd', 'quote')).toEqual({
      text: 'a\n> b\n> c\nd',
      selectStart: 2,
      selectEnd: 9,
    })
  })

  it('removes bullet markers when already present', () => {
    expect(applyMarkdownFormat('', '- a\n- b', '', 'bullet')).toEqual({
      text: 'a\nb',
      selectStart: 0,
      selectEnd: 3,
    })
  })

  it('numbers plain lines and leaves blank lines alone', () => {
    expect(applyMarkdownFormat('', 'a\n\nb', '', 'ordered')).toEqual({
      text: '1. a\n\n1. b',
      selectStart: 0,
      selectEnd: 10,
    })
  })

  it('adds a heading marker to the current line only', () => {
    expect(applyMarkdownFormat('Title\n', '', 'body', 'heading')).toEqual({
      text: 'Title\n## body',
      selectStart: 6,
      selectEnd: 13,
    })
  })
})
