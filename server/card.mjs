import {separateIdentityAbility} from '../src/domain/identityAbility.ts';
export function spiritAnimalOf(character){
  if(typeof character.spiritAnimal==='string'&&character.spiritAnimal.trim())return character.spiritAnimal.trim();
  return typeof character.str==='string'?character.str.match(/精神体\s*[:：]?\s*([^·\n]+)/)?.[1]?.trim():undefined;
}
export function mentalPowerLevelOf(c){if(typeof c.mentalPowerLevel==='string'&&c.mentalPowerLevel.trim())return c.mentalPowerLevel.trim();return typeof c.str==='string'?c.str.match(/精神力(?:等级)?\s*[:：]?\s*([^·\n，,；;]+)/)?.[1]?.trim():undefined;}
/** Extract only explicit current affiliation/grade/jobs, never relatives' or former jobs. */
export function identityOf(c){
  if(typeof c.identity==='string'&&c.identity.trim()&&c.identity.length<=200)return separateIdentityAbility({identity:c.identity}).identity;
  if(typeof c.title!=='string')return;
  let department='',grade='';const roles=[],organizations=[];let organization;
  for(const raw of c.title.split(/[·•|\n；;\s]+/)){
    const token=raw.trim();if(!token||/^(?:前|原|曾任)|之[子女]|独[子女]|少主|继承人|天才/u.test(token))continue;
    const year=token.match(/^([一二三四五六七八九十零\d]+年级)(.*)$/u);if(year){grade=year[1];if(year[2].trim())roles.push(year[2].trim());continue;}
    const academic=token.match(/^(.+?系)(首席)?$/u);if(academic){if(!department){department=academic[1];if(academic[2])roles.push(academic[2]);}else if(academic[2])roles.push(token);continue;}
    if(/(?:董事会|学生会|委员会|协会|部门|办公室|学院|中心)$/u.test(token)){organization={name:token,positions:[]};organizations.push(organization);continue;}
    if(/教官|院长|会长|部长|主席|主任|负责人|导师|教师|教授|助理|指挥官|委员|董事|研究员|军官|工程师|医生/u.test(token)){if(organization)organization.positions.push(token);else roles.push(token);}
  }
  const job=roles.join(' '),position=grade+(job?(grade&&job!=='首席'?' ':'')+job:'');
  const lines=[department?[department,position].filter(Boolean).join(' '):position,...organizations.map(o=>[o.name,...o.positions].join(' '))].filter(Boolean);
  const result=[...new Set(lines)].join('\n');return result&&result.length<=200?result:undefined;
}
export function abilityOf(c){if(typeof c.ability==='string'&&c.ability.trim()&&c.ability.length<=2000)return c.ability.trim();const fromIdentity=separateIdentityAbility({identity:c.identity}).ability;if(fromIdentity)return fromIdentity;return typeof c.str==='string'?c.str.match(/(?:异能|特殊能力)\s*[:：]?\s*([^·\n]+)/)?.[1]?.trim():undefined;}
export function publicActor(c){const spiritAnimal=spiritAnimalOf(c),mentalPowerLevel=mentalPowerLevelOf(c),identity=identityOf(c),ability=abilityOf(c);return {id:c.id,name:c.name,...(identity?{identity}:{}),...(ability?{ability}:{}),...(mentalPowerLevel?{mentalPowerLevel}:{}),...(c.sex?{secondaryGender:c.sex}:{}),...(c.primaryGender?{primaryGender:c.primaryGender}:{}),...(spiritAnimal?{spiritAnimal}:{}),present:false};}
