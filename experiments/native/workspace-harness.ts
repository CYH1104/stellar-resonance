// Test-only entry for the isolated browser business-flow driver, not a production UI entry.
import {effectScope} from 'vue';
import {useWorkspace} from '../../src/app/useWorkspace';
export function createWorkspaceHarness(){const scope=effectScope();return {scope,w:scope.run(()=>useWorkspace())!};}
