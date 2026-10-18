import {applyRegexRules} from './regex';
self.onmessage=event=>{
 const {text,rules,context}=event.data;let output=text;const errors:string[]=[];
 for(const rule of rules){
  self.postMessage({type:'progress',text:output,errors,ruleName:rule.scriptName});
  const result=applyRegexRules(output,[rule],context);output=result.text;errors.push(...result.errors);
 }
 self.postMessage({text:output,errors});
};
