/** Courses recur by story weekday. Device time must never advance the story schedule. */
export function nextTerminalCourse<T extends {day:number;time:string}>(courses:readonly T[],clock:{day:number;time:string}):T|undefined{
 const minutes=(time:string)=>{const match=time.match(/^(\d{1,2}):([0-5]\d)$/);return match&&+match[1]<24?+match[1]*60 + +match[2]:undefined;};
 const today=clock.day>=1&&clock.day<=7?clock.day:0,now=minutes(clock.time);
 const distance=(c:T)=>{let days=today?(c.day-today+7)%7:c.day-1;const start=minutes(c.time)!;if(today&&days===0&&now!==undefined&&start<now)days=7;return days*1440+start;};
 return courses.filter(c=>Number.isInteger(c.day)&&c.day>=1&&c.day<=7&&minutes(c.time)!==undefined).sort((a,b)=>distance(a)-distance(b))[0];
}
