/**
 * Corpus Splitter Utility
 * Handles splitting text and music corpora into manageable prompts
 */

/**
 * Split text corpus into sentences/prompts
 * - Split by sentence
 * - Max length: 10-15 words
 * - Remove empty lines and duplicates
 */
export function splitTextCorpus(content, options = {}) {
  const maxWords = options.maxWords || 15;
  const minWords = options.minWords || 3;

  // Split by sentence-ending punctuation while preserving the punctuation
  const sentences = content
    .replace(/\r\n/g, '\n')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  const prompts = [];
  const seen = new Set();

  for (const sentence of sentences) {
    // Clean the sentence
    const cleaned = sentence
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleaned) continue;

    // Skip duplicates
    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const words = cleaned.split(/\s+/);

    if (words.length <= maxWords) {
      // Sentence fits within limit
      if (words.length >= minWords) {
        prompts.push(cleaned);
      }
    } else {
      // Need to split into smaller chunks
      let chunk = [];
      for (const word of words) {
        chunk.push(word);
        // Try to split at natural breaks (commas, semicolons) or at max length
        if (chunk.length >= maxWords ||
            (chunk.length >= minWords && /[,;:]$/.test(word))) {
          prompts.push(chunk.join(' '));
          chunk = [];
        }
      }
      // Don't forget remaining words
      if (chunk.length >= minWords) {
        prompts.push(chunk.join(' '));
      }
    }
  }

  return prompts;
}

/**
 * Split music corpus (ABC notation) into individual tunes
 * - Split by tune (X: header indicates new tune)
 * - One melody per prompt
 */
export function splitMusicCorpus(content) {
  const prompts = [];
  const seen = new Set();

  // Split by X: header (tune number in ABC notation)
  const tunes = content
    .replace(/\r\n/g, '\n')
    .split(/(?=^X:\s*\d+)/m)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  for (const tune of tunes) {
    // Skip if it doesn't look like a valid ABC tune
    if (!tune.startsWith('X:') && !tune.includes('K:')) {
      // Maybe it's a simple one-line melody
      if (tune.match(/[A-Ga-g]/)) {
        const normalized = tune.toLowerCase().replace(/\s+/g, '');
        if (!seen.has(normalized)) {
          seen.add(normalized);
          prompts.push(tune);
        }
      }
      continue;
    }

    // Normalize and check for duplicates
    const normalized = tune.toLowerCase().replace(/\s+/g, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    prompts.push(tune);
  }

  return prompts;
}

/**
 * Parse JSON corpus file
 */
export function parseJsonCorpus(content, type) {
  const data = JSON.parse(content);

  // Handle array of strings
  if (Array.isArray(data)) {
    return data.filter(item => typeof item === 'string' && item.trim());
  }

  // Handle array of objects with text/content field
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    return data
      .map(item => item.text || item.content || item.prompt || '')
      .filter(s => s.trim());
  }

  // Handle object with items/prompts/data array
  const items = data.items || data.prompts || data.data || [];
  if (Array.isArray(items)) {
    return items
      .map(item => typeof item === 'string' ? item : (item.text || item.content || ''))
      .filter(s => s.trim());
  }

  return [];
}

/**
 * Parse CSV corpus file
 */
export function parseCsvCorpus(content) {
  const lines = content
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Skip header if it looks like one
  const startIndex = lines[0].toLowerCase().includes('text') ||
                     lines[0].toLowerCase().includes('prompt') ||
                     lines[0].toLowerCase().includes('content') ? 1 : 0;

  return lines.slice(startIndex).map(line => {
    // Handle quoted CSV values
    const match = line.match(/^"(.+)"$|^'(.+)'$|^(.+)$/);
    return (match[1] || match[2] || match[3] || '').trim();
  }).filter(s => s.length > 0);
}

/**
 * Main corpus splitting function
 */
export function splitCorpus(content, type, format) {
  switch (format) {
    case 'json':
      const jsonItems = parseJsonCorpus(content, type);
      return type === 'text'
        ? jsonItems.flatMap(item => splitTextCorpus(item))
        : jsonItems;

    case 'csv':
      const csvItems = parseCsvCorpus(content);
      return type === 'text'
        ? csvItems.flatMap(item => splitTextCorpus(item))
        : csvItems;

    case 'abc':
      return splitMusicCorpus(content);

    case 'txt':
    default:
      return type === 'text'
        ? splitTextCorpus(content)
        : splitMusicCorpus(content);
  }
}

/**
 * Detect file format from extension or content
 */
export function detectFormat(filename, content) {
  const ext = filename.split('.').pop()?.toLowerCase();

  if (ext === 'json') return 'json';
  if (ext === 'csv') return 'csv';
  if (ext === 'abc') return 'abc';

  // Try to detect from content
  try {
    JSON.parse(content);
    return 'json';
  } catch {}

  if (content.includes(',') && content.split('\n')[0].includes(',')) {
    return 'csv';
  }

  if (content.includes('X:') && content.includes('K:')) {
    return 'abc';
  }

  return 'txt';
}
