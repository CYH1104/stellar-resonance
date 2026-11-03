import {resolve} from 'node:path';
import {createRelayPolicy} from '../../server/relay-policy.mjs';

const fail=(code,status=400)=>Object.assign(Error(code),{code,status});
/** Retain the native request implementation and native Secrets account scope. */
export function nativeModelBody(input,messages){
 if(!input||typeof input!=='object')throw fail('INVALID_MODEL_REQUEST');
 if(input.custom_url!==undefined){let url;try{url=new URL(input.custom_url);}catch{throw fail('INVALID_MODEL_URL');}if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw fail('INVALID_MODEL_URL');}
 let authorization='';
 if(input.custom_include_headers){
  let headers;try{headers=JSON.parse(input.custom_include_headers);}catch{throw fail('INVALID_MODEL_HEADERS');}
  if(!headers||Array.isArray(headers)||typeof headers!=='object'||Object.keys(headers).some(key=>key!=='Authorization')||typeof headers.Authorization!=='string'||!/^Bearer [^\r\n]+$/.test(headers.Authorization)||headers.Authorization.length>16384)throw fail('INVALID_MODEL_HEADERS');
  authorization=headers.Authorization;
 }
 if(input.secret_id!==undefined&&(typeof input.secret_id!=='string'||!input.secret_id||input.secret_id.length>200))throw fail('INVALID_MODEL_SECRET');
 return {...input,...(messages?{messages}:{}),
  include_reasoning:false,request_thoughts:false,show_thoughts:false,reasoning_effort:undefined,
  reverse_proxy:'',proxy_password:'',custom_include_body:'',custom_exclude_body:'',
  custom_include_headers:authorization?JSON.stringify({Authorization:authorization}):'',custom_exclude_headers:'',
  chat_completion_source:'custom',
 };
}

export function nativeModelPolicy(){
 const directory=process.env.ACADEMY_AUTHOR_DATA;
 if(!directory)throw fail('ACADEMY_AUTHOR_DATA_REQUIRED',503);
 return createRelayPolicy(resolve(directory,'relay-policy.json'));
}
