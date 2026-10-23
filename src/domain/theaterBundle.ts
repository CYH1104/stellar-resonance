import {cleanTheaterShare} from './theaterShare';
import {cleanRegexRules,type RegexRule} from './regex';
import type {TheaterSetting} from './contracts';
export function theaterBundle(setting:TheaterSetting,rules:RegexRule[]){return {version:1,theater:cleanTheaterShare({version:1,...setting}),regexRules:cleanRegexRules(rules.filter(r=>setting.regexIds?setting.regexIds.includes(r.id):r.placement.includes(7))).map(({setId,...r})=>({...r,placement:[7],markdownOnly:true,promptOnly:false}))};}
export function parseTheaterBundle(text:string){if(text.length>5000000)throw Error('文件最多5MB');const p=JSON.parse(text.replace(/^\uFEFF/,''));if(p?.version!==1||!p.theater||!Array.isArray(p.regexRules))throw Error('小剧场 JSON 格式不正确');return {theater:cleanTheaterShare(p.theater),regexRules:cleanRegexRules(p.regexRules).map(({setId,...r})=>({...r,placement:[7],markdownOnly:true,promptOnly:false}))};}
