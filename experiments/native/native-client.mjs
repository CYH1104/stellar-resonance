// Step 2 only: exercise the real native backend, not a replacement prompt engine.
export function loopbackOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('LOOPBACK_ORIGIN_REQUIRED');
  return url.origin;
}

export function createNativeClient({origin, upstream, fetchImpl = fetch, onRequest = () => {}}) {
  origin = loopbackOrigin(origin);
  const allowed = new URL(upstream);
  if (allowed.origin !== loopbackOrigin(allowed.origin) || allowed.username || allowed.password || allowed.pathname !== '/v1' || allowed.search || allowed.hash) throw Error('LOCAL_FIXTURE_REQUIRED');
  // No caller-supplied upstream URLs, keys or arbitrary custom headers cross this bridge.
  async function complete(body, signal, {relayTicket}={}) {
    if(relayTicket!==undefined&&!/^native-relay-[a-f0-9]{64}$/.test(relayTicket))throw Error('INVALID_NATIVE_RELAY_TICKET');
    signal?.throwIfAborted();
    const csrf = await fetchImpl(origin + '/csrf-token', {signal, redirect:'error'});
    if (!csrf.ok) throw Error('NATIVE_CSRF_FAILED');
    const cookies = csrf.headers.getSetCookie().map(v => v.split(';', 1)[0]).join('; ');
    const {token} = await csrf.json();
    if (!token || !cookies) throw Error('NATIVE_SESSION_MISSING');
    const payload = {
      chat_completion_source:'custom', custom_url:upstream, model:body.model,
      messages:body.messages, stream:true, temperature:body.temperature,
      max_tokens:body.max_tokens, top_p:body.top_p,
      frequency_penalty:body.frequency_penalty, presence_penalty:body.presence_penalty,
      include_reasoning:false,
      custom_include_body:JSON.stringify({include_reasoning:false}),
      custom_include_headers:JSON.stringify({Authorization:relayTicket?'Bearer '+relayTicket:'Bearer synthetic-native-fixture'}),
    };
    onRequest({model:payload.model, messages:payload.messages.length, reasoningRequested:false});
    const response=await fetchImpl(origin + '/api/backends/chat-completions/generate', {
      method:'POST', redirect:'error', signal,
      headers:{'Content-Type':'application/json','X-CSRF-Token':token,Cookie:cookies},
      body:JSON.stringify(payload),
    });
    // Native forwardFetchResponse may omit Content-Type. Verify actual SSE bytes
    // before adapting its transport metadata; never relabel HTML/JSON as a stream.
    if(!response.ok||response.headers.get('content-type')?.includes('text/event-stream'))return response;
    const reader=response.body?.getReader();if(!reader)throw Error('NATIVE_STREAM_EMPTY');
    const initial=[];let size=0;
    while(size<6){const item=await reader.read();if(item.done)break;initial.push(item.value);size+=item.value.length;}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of initial){bytes.set(chunk,offset);offset+=chunk.length;}
    if(!/^\s*(?:data:|:)/.test(new TextDecoder().decode(bytes.subarray(0,128)))){await reader.cancel();throw Error('NATIVE_STREAM_NOT_SSE');}
    const headers=new Headers(response.headers);headers.set('Content-Type','text/event-stream; charset=utf-8');
    return new Response(new ReadableStream({start(controller){controller.enqueue(bytes);},async pull(controller){try{const item=await reader.read();if(item.done){controller.close();reader.releaseLock();}else controller.enqueue(item.value);}catch(error){controller.error(error);}},cancel(reason){return reader.cancel(reason);}}),{status:response.status,headers});
  }
  return {complete};
}

export function createNativeFetch(client) {
  return async (url, init = {}) => {
    if (String(url) !== 'https://native-verification.invalid/v1/chat/completions' || init.method !== 'POST') throw Error('SPIKE_EXTERNAL_REQUEST_BLOCKED');
    return client.complete(JSON.parse(init.body), init.signal);
  };
}
