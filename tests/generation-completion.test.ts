import {expect,it} from 'vitest';
import {clearCompletionHistory,generationCompletion,markGenerationComplete,startGeneration,finishGeneration} from '../src/app/generationCompletion';

it('notifies once per real successful callId and ignores duplicates',()=>{
 clearCompletionHistory();
 expect(markGenerationComplete('call-a')).toBe(true);
 const first=generationCompletion.at;
 expect(markGenerationComplete('call-a')).toBe(false);
 expect(generationCompletion.id).toBe('call-a');
 expect(markGenerationComplete('call-b')).toBe(true);
 expect(generationCompletion.id).toBe('call-b');
 expect(generationCompletion.at).toBeGreaterThanOrEqual(first);
 expect(markGenerationComplete('')).toBe(false);
});
it('keeps generating active until all terminal requests finish, including cancellation or failure',()=>{
 startGeneration('terminal-one');startGeneration('terminal-two');expect(generationCompletion.pending).toBe(2);
 finishGeneration('terminal-one');expect(generationCompletion.pending).toBe(1);
 finishGeneration('terminal-two');expect(generationCompletion.pending).toBe(0);
 finishGeneration('terminal-two');expect(generationCompletion.pending).toBe(0);
});
