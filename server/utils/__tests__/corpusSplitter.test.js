import {
  splitTextCorpus,
  splitMusicCorpus,
  parseJsonCorpus,
  parseCsvCorpus,
  splitCorpus,
  detectFormat
} from '../corpusSplitter.js';

describe('splitTextCorpus', () => {
  test('splits text by sentences', () => {
    const content = 'Hello world. How are you? I am fine.';
    const result = splitTextCorpus(content);

    expect(result).toHaveLength(3);
    expect(result).toContain('Hello world.');
    expect(result).toContain('How are you?');
    expect(result).toContain('I am fine.');
  });

  test('removes duplicate sentences', () => {
    const content = 'Hello world. Hello world. Different sentence.';
    const result = splitTextCorpus(content);

    expect(result).toHaveLength(2);
    expect(result).toContain('Hello world.');
    expect(result).toContain('Different sentence.');
  });

  test('filters out sentences shorter than minWords', () => {
    const content = 'Hi. Hello world today. Bye.';
    const result = splitTextCorpus(content, { minWords: 3 });

    expect(result).toHaveLength(1);
    expect(result).toContain('Hello world today.');
  });

  test('splits long sentences at natural breaks', () => {
    const content = 'This is a very long sentence with many words, and it should be split at the comma or at the maximum length.';
    const result = splitTextCorpus(content, { maxWords: 10 });

    expect(result.length).toBeGreaterThan(1);
    result.forEach(prompt => {
      const wordCount = prompt.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(10);
    });
  });

  test('handles empty content', () => {
    const result = splitTextCorpus('');
    expect(result).toHaveLength(0);
  });

  test('handles content with only whitespace', () => {
    const result = splitTextCorpus('   \n\n   ');
    expect(result).toHaveLength(0);
  });

  test('normalizes whitespace', () => {
    const content = 'Hello    world   today.   How   are   you?';
    const result = splitTextCorpus(content);

    expect(result).toContain('Hello world today.');
    expect(result).toContain('How are you?');
  });

  test('handles Windows line endings', () => {
    const content = 'Hello world.\r\nHow are you?';
    const result = splitTextCorpus(content);

    expect(result).toHaveLength(2);
  });
});

describe('splitMusicCorpus', () => {
  test('splits ABC notation by X: headers', () => {
    const content = `X:1
T:First Tune
K:C
CDEF GABc

X:2
T:Second Tune
K:G
GABc defg`;

    const result = splitMusicCorpus(content);

    expect(result).toHaveLength(2);
    expect(result[0]).toContain('X:1');
    expect(result[1]).toContain('X:2');
  });

  test('removes duplicate tunes', () => {
    const content = `X:1
T:Tune
K:C
CDEF

X:2
T:Tune
K:C
CDEF`;

    const result = splitMusicCorpus(content);

    expect(result).toHaveLength(1);
  });

  test('handles simple melody lines', () => {
    const content = 'CDEF GABc\ndefg abc';
    const result = splitMusicCorpus(content);

    expect(result).toHaveLength(2);
  });

  test('handles empty content', () => {
    const result = splitMusicCorpus('');
    expect(result).toHaveLength(0);
  });
});

describe('parseJsonCorpus', () => {
  test('parses array of strings', () => {
    const content = '["Hello world.", "How are you?"]';
    const result = parseJsonCorpus(content, 'text');

    expect(result).toHaveLength(2);
    expect(result).toContain('Hello world.');
  });

  test('parses array of objects with text field', () => {
    const content = '[{"text": "Hello"}, {"text": "World"}]';
    const result = parseJsonCorpus(content, 'text');

    expect(result).toHaveLength(2);
    expect(result).toContain('Hello');
  });

  test('parses object with items array', () => {
    const content = '{"items": ["Item 1", "Item 2"]}';
    const result = parseJsonCorpus(content, 'text');

    expect(result).toHaveLength(2);
  });

  test('parses object with prompts array', () => {
    const content = '{"prompts": [{"text": "Prompt 1"}, {"content": "Prompt 2"}]}';
    const result = parseJsonCorpus(content, 'text');

    expect(result).toHaveLength(2);
  });

  test('filters empty strings', () => {
    const content = '["Hello", "", "  ", "World"]';
    const result = parseJsonCorpus(content, 'text');

    expect(result).toHaveLength(2);
  });
});

describe('parseCsvCorpus', () => {
  test('parses simple CSV lines', () => {
    const content = 'Hello world\nHow are you\nGoodbye';
    const result = parseCsvCorpus(content);

    expect(result).toHaveLength(3);
    expect(result).toContain('Hello world');
  });

  test('skips header row', () => {
    const content = 'text,id\nHello world,1\nGoodbye,2';
    const result = parseCsvCorpus(content);

    expect(result).toHaveLength(2);
    expect(result).not.toContain('text,id');
  });

  test('handles quoted values', () => {
    const content = '"Hello world"\n\'Quoted text\'';
    const result = parseCsvCorpus(content);

    expect(result).toContain('Hello world');
    expect(result).toContain('Quoted text');
  });

  test('filters empty lines', () => {
    const content = 'Hello\n\n\nWorld';
    const result = parseCsvCorpus(content);

    expect(result).toHaveLength(2);
  });
});

describe('splitCorpus', () => {
  test('handles txt format for text type', () => {
    const content = 'Hello world. How are you?';
    const result = splitCorpus(content, 'text', 'txt');

    expect(result).toHaveLength(2);
  });

  test('handles json format for text type', () => {
    const content = '["Hello world.", "How are you?"]';
    const result = splitCorpus(content, 'text', 'json');

    expect(result).toHaveLength(2);
  });

  test('handles csv format for text type', () => {
    const content = 'Hello world.\nHow are you?';
    const result = splitCorpus(content, 'text', 'csv');

    expect(result).toHaveLength(2);
  });

  test('handles abc format for music type', () => {
    const content = 'X:1\nK:C\nCDEF';
    const result = splitCorpus(content, 'music', 'abc');

    expect(result).toHaveLength(1);
  });

  test('handles txt format for music type', () => {
    const content = 'CDEF GABc';
    const result = splitCorpus(content, 'music', 'txt');

    expect(result.length).toBeGreaterThan(0);
  });
});

describe('detectFormat', () => {
  test('detects json from extension', () => {
    expect(detectFormat('corpus.json', '{}')).toBe('json');
  });

  test('detects csv from extension', () => {
    expect(detectFormat('corpus.csv', 'a,b,c')).toBe('csv');
  });

  test('detects abc from extension', () => {
    expect(detectFormat('tunes.abc', 'X:1')).toBe('abc');
  });

  test('detects json from content', () => {
    expect(detectFormat('corpus.txt', '["hello"]')).toBe('json');
  });

  test('detects csv from content', () => {
    expect(detectFormat('corpus.txt', 'a,b,c\n1,2,3')).toBe('csv');
  });

  test('detects abc from content', () => {
    expect(detectFormat('corpus.txt', 'X:1\nT:Title\nK:C\nCDEF')).toBe('abc');
  });

  test('defaults to txt', () => {
    expect(detectFormat('corpus.txt', 'Hello world.')).toBe('txt');
  });
});
