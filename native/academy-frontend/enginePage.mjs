/** Keep fragment links local while loading every native module at its canonical URL. */
export function nativeEnginePage(text){
  return text.replace(/<base\b[^>]*>/gi,'<base href="/native-engine/">').replace(/\b(src|href)="(?!#|\/|https?:|data:|mailto:|javascript:)([^"]+)"/gi,(_match,name,value)=>`${name}="/${value}"`);
}
