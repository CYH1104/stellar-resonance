/** Hide decorative emoji without changing imported prompt content. */
export function withoutEmoji(value:string){return value.replace(/\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?)*|[\u{1F1E6}-\u{1F1FF}]|[\uFE0F\u20E3]/gu,'').trim();}
