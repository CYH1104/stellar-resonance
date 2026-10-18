import {applyRegexRules} from './regex';
self.onmessage=event=>{const {text,rules,context}=event.data;self.postMessage(applyRegexRules(text,rules,context));};
