import {it,expect} from 'vitest';
import {masterPersonaSummary} from '../src/domain/masterPersona';
import {blankPersona} from '../src/domain/persona';
it('reads the user persona and leaves unspecified optional details empty',()=>{
  expect(masterPersonaSummary({...blankPersona(),name:'林星'})).toEqual({name:'林星',department:'',spiritLevel:''});
  expect(masterPersonaSummary({...blankPersona(),name:'林星',identity:'织网者',other:'信息素：松木\n精神力等级：S'})).toEqual({name:'林星',department:'织网者',spiritLevel:'S'});
});
it('uses explicit labels in imported text without inventing an affiliation or rank',()=>{
  expect(masterPersonaSummary({...blankPersona(),name:'林星',identity:undefined,other:undefined,rawText:'## 院系：银铃\n精神力：A\n背景：入学新生'})).toEqual({name:'林星',department:'银铃',spiritLevel:'A'});
  expect(masterPersonaSummary({...blankPersona(),name:'林星',rawText:'院系：银铃\n精神力：A'})).toEqual({name:'林星',department:'',spiritLevel:''});
  expect(masterPersonaSummary({...blankPersona(),name:'林星',rawText:'喜欢去学院图书馆学习。'}).department).toBe('');
});
