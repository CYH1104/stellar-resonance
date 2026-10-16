import {describe,it,expect} from 'vitest';
import {readPersonaExtra,writePersonaExtra,personaNotes,writePersonaNotes} from '../src/domain/personaExtras';
import {normalizePersona} from '../src/domain/persona';
describe('original form extra fields',()=>{
  it('keeps selections and free notes in the supported persona saved and model payload',()=>{
    let text=writePersonaExtra('喜欢安静\n随身带一本书','信息素','雪松');
    text=writePersonaExtra(text,'精神力等级','S');
    const persona=normalizePersona({name:'新生',other:text});
    expect(readPersonaExtra(persona.other,'信息素')).toBe('雪松');
    expect(readPersonaExtra(persona.other,'精神力等级')).toBe('S');
    expect(personaNotes(persona.other)).toBe('喜欢安静\n随身带一本书');
    const edited=writePersonaNotes(persona.other,'新的备注');
    expect(readPersonaExtra(edited,'精神力等级')).toBe('S');
    expect(personaNotes(edited)).toBe('新的备注');
  });
  it('replaces and clears a choice without losing other fields or notes',()=>{
    let text=writePersonaExtra('备注','精神力等级','A');
    text=writePersonaExtra(text,'精神力等级','S');
    expect(text).toBe('备注\n精神力等级：S');
    expect(writePersonaExtra(text,'精神力等级','')).toBe('备注');
  });
});

