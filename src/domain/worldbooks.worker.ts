import {resolveWorldbooks} from './worldbooks';
self.onmessage=event=>{try{self.postMessage({type:'done',result:resolveWorldbooks(event.data.books,event.data.context)});}catch{self.postMessage({type:'error'});}};
self.postMessage({type:'ready'});
