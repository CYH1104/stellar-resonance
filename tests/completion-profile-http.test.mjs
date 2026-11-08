import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {resolve} from 'node:path';
import {createLocalServer} from '../server/app.mjs';import {completionProfile} from '../src/domain/completionProfile.ts';import {defaultTheaters} from '../src/domain/theaters.ts';
test('actual HTTP: small probe passes while zero penalties fail; compatible prose keeps the configured model and token budget',async()=>{
 const root=resolve(import.meta.dirname,'..'),card=JSON.parse(await readFile(resolve(root,'server/example/feature-demo.json'),'utf8')),calls=[];
 const app=await createLocalServer({projectRoot:root,port:0,card,fetchImpl:async(_url,init)=>{const body=JSON.parse(init.body);calls.push(body);if(body.frequency_penalty!==undefined||body.presence_penalty!==undefined)return Response.json({error:{param:'frequency_penalty',message:'Unsupported parameter'}},{status:400});return Response.json({choices:[{message:{content:'合成正文。<SR_STATE>{"event":"合成推进"}</SR_STATE><SR_DONE>'}}]});}});
 try{const origin='http://127.0.0.1:'+await app.start(),cookie=(await fetch(origin+'/api/bootstrap')).headers.get('set-cookie').split(';')[0],post=(path,body)=>fetch(origin+path,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const profile={id:'main',providerId:'approved-provider',name:'主API',apiBaseUrl:'https://synthetic.example/v1',model:'pg/gemini-compatible-high',maxTokens:32000,temperature:.7,topP:1,frequencyPenalty:0,presencePenalty:0};
  assert.equal((await post('/api/connection',{profileId:profile.id,apiBaseUrl:profile.apiBaseUrl})).status,200);
  assert.equal((await post('/api/probe',{profile,key:'synthetic-key',kind:'text'})).status,200);assert.equal(calls[0].max_tokens,512);
  const game=await(await post('/api/new-game',{persona:{name:'合成玩家',primaryGender:'男'}})).json(),request={profile,key:'synthetic-key',persona:{name:'合成玩家',primaryGender:'男'},opening:game.opening,state:game.initial,input:'继续',history:[],memories:[],presets:[],stateEnabled:false,suggestionsEnabled:false,theaterSettings:defaultTheaters().map(t=>({...t,enabled:false})),singleStateCall:true};
  const rejected=await post('/api/generate',request);assert.equal(rejected.status,502);assert.equal((await rejected.json()).upstreamStatus,400);
  const accepted=await post('/api/generate',{...request,profile:completionProfile(profile)});assert.equal(accepted.status,200);assert.ok((await accepted.text()).includes('合成正文'));assert.equal(calls.at(-1).model,profile.model);assert.equal(calls.at(-1).max_tokens,32000);assert.equal(calls.at(-1).top_p,1);assert.equal(calls.length,3);
 }finally{app.server.closeAllConnections();await new Promise(done=>app.server.close(done));}
});
