import type { AutoPhase, AutoCycleStatus, AutoFinding, AutoSettings } from './types';

export interface PhaseSelection {
  phase: AutoPhase;
  findingId: string | null;  // which finding to address (for fix/improve phases)
}

export class PhaseSelector {
  constructor(private settings: AutoSettings) {}

  /**
   * Select the next phase based on current state.
   */
  selectNextPhase(context: {
    cycleNumber: number;
    lastPhase: AutoPhase | null;
    lastCycleStatus: AutoCycleStatus | null;
    lastFindingId: string | null;
    openFindings: AutoFinding[];
    totalCycles: number;
  }): PhaseSelection {
    const { cycleNumber, lastPhase, lastCycleStatus, lastFindingId, openFindings, totalCycles } = context;

    // 1. First cycle (no findings yet): discovery
    if (cycleNumber === 0 || (totalCycles === 0 && openFindings.length === 0)) {
      return { phase: 'discovery', findingId: null };
    }

    // 2. After a fix/improve cycle, always run test
    if ((lastPhase === 'fix' || lastPhase === 'improve') && lastCycleStatus === 'completed') {
      return { phase: 'test', findingId: null };
    }

    // 3. After a failed test, try to fix the most recent finding again (if retries left)
    if (lastPhase === 'test' && lastCycleStatus === 'failed' && lastFindingId) {
      const finding = openFindings.find(f => f.id === lastFindingId);
      if (finding && finding.retry_count < finding.max_retries) {
        return { phase: 'fix', findingId: finding.id };
      }
    }

    // 4. Periodic review (every review_interval cycles)
    if (this.settings.review_interval > 0 && cycleNumber > 0 && cycleNumber % this.settings.review_interval === 0) {
      return { phase: 'review', findingId: null };
    }

    // 5. Periodic discovery (every discovery_interval cycles)
    if (this.settings.discovery_interval > 0 && cycleNumber > 0 && cycleNumber % this.settings.discovery_interval === 0) {
      return { phase: 'discovery', findingId: null };
    }

    // 6. P0 findings exist (critical) -> fix
    const p0 = openFindings.filter(f => f.priority === 'P0' && f.status === 'open' && f.retry_count < f.max_retries);
    if (p0.length > 0) {
      return { phase: 'fix', findingId: p0[0].id };
    }

    // 7. P1 findings exist -> fix
    const p1 = openFindings.filter(f => f.priority === 'P1' && f.status === 'open' && f.retry_count < f.max_retries);
    if (p1.length > 0) {
      return { phase: 'fix', findingId: p1[0].id };
    }

    // 8. P2 findings exist -> improve
    const p2 = openFindings.filter(f => f.priority === 'P2' && f.status === 'open' && f.retry_count < f.max_retries);
    if (p2.length > 0) {
      return { phase: 'improve', findingId: p2[0].id };
    }

    // 9. P3 findings exist -> improve
    const p3 = openFindings.filter(f => f.priority === 'P3' && f.status === 'open' && f.retry_count < f.max_retries);
    if (p3.length > 0) {
      return { phase: 'improve', findingId: p3[0].id };
    }

    // 10. No actionable findings -> discovery to find more
    return { phase: 'discovery', findingId: null };
  }
}
