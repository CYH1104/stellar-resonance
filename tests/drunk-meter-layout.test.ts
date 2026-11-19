import {it,expect} from 'vitest';
// @ts-ignore Node fs is available to the Vitest runner in this repository.
import {readFileSync} from 'node:fs';
const party:string=readFileSync('src/components/PartyGameRoom.vue','utf8'),terminal:string=readFileSync('src/components/PersonalTerminal.vue','utf8');
function rule(source:string,selector:string){return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(match=>match[1].split(',').map(value=>value.trim()).includes(selector)).map(match=>match[2]).join(';');}
it('keeps party alcohol-meter progress inside a zero-minimum fluid grid column',()=>{
 const person=rule(party,'.party-drunk-person'),progress=rule(party,'.party-drunk-person progress'),outer=rule(party,'.party-drunk');expect(person).toContain('grid-template-columns:30px minmax(0,1fr)');expect(person).toContain('min-width:0');expect(person).toContain('box-sizing:border-box');expect(progress).toContain('width:100%!important');expect(progress).toContain('max-width:100%!important');expect(progress).toContain('min-width:0!important');expect(progress).toContain('box-sizing:border-box');expect(outer).toContain('min-width:0');expect(outer).toContain('max-width:100%');
});
it('overrides the legacy 88px progress width only for King alcohol meters',()=>{
 const general=rule(terminal,'#academy-workspace .pt progress'),strip=rule(terminal,'#academy-workspace .pt-drunk-strip progress'),tolerance=rule(terminal,'#academy-workspace .pt-tolerance progress');expect(general).toContain('width:88px');for(const css of [strip,tolerance]){expect(css).toContain('min-width:0');expect(css).toContain('max-width:100%');expect(css).toContain('box-sizing:border-box');}expect(strip).toContain('width:min(88px,100%)');expect(tolerance).toContain('width:min(88px,100%)');
});
