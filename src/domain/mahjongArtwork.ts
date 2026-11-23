/** Asset names follow the pinned FluffyStuff set; red fives retain their identity. */
export function mahjongArtworkName(tile:string):string{
 if(tile==='back')return 'Back';
 const match=/^([mpsz])([0-9])(?:[_*+=-]*)$/.exec(tile);
 if(!match)throw Error('麻将牌图片编号不正确');
 const [,suit,value]=match,n=Number(value);
 if(suit==='z'){const name=['','Ton','Nan','Shaa','Pei','Haku','Hatsu','Chun'][n];if(!name)throw Error('字牌图片编号不正确');return name;}
 return ({m:'Man',p:'Pin',s:'Sou'} as Record<string,string>)[suit]+(n===0?'5-Dora':value);
}
