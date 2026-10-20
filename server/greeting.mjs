import {normalizeDefaultOpening} from '../src/domain/opening.ts';
export function defaultGreeting(lines){if(!Array.isArray(lines))return lines;const text=lines.join('\n'),normalized=normalizeDefaultOpening(text);return normalized===text?lines:normalized.split('\n');}
