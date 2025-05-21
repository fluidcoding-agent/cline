/*************************************************************
 * unified-phase-tracker.ts
 * - PhaseTracker (레거시)
 * - ImprovedPhaseTracker (신규)
 * - PhaseTrackerAdapter (어댑터)
 *************************************************************/

import * as vscode from 'vscode';
import { Phase, PhaseStatus } from '../assistant-message/index';
import { Controller } from '../controller';

/** 
 * 서브태스크 상태 
 *  - 레거시/신규 트래커가 동시에 사용하도록, 확장 가능한 공통 인터페이스 
 */
export interface SubtaskState {
  /** ImprovedPhaseTracker에서 사용하는 식별자 */
  id?: string;
  description: string;
  completed: boolean;
  /** ImprovedPhaseTracker 전용 타입 구분 (legacy는 사용 안 함) */
  type?: string;
  /** ImprovedPhaseTracker 전용 result */
  result?: string;
  /** 시작/끝 시간 */
  startTime?: number;
  endTime?: number;
}

/**
 * 각 Phase(단계)의 상태를 담는 인터페이스
 *  - 레거시/신규 트래커가 동시에 사용하도록, 확장 가능한 공통 인터페이스 
 */
export interface PhaseState {
  id: number;
  prompt: string;
  subtasks: SubtaskState[];
  complete: boolean;

  // 아래는 ImprovedPhaseTracker에서 주로 사용하는 확장 필드(legacy 트래커에선 거의 안 씀)
  paths?: string[];
  status?: PhaseStatus | string; 
  index?: number;
  phase_prompt?: string;
  startTime?: number;
  endTime?: number;
  artifacts?: string[]; 
  dependencies?: number[];
}

/**
 * 하나의 Phase가 끝난 뒤 결과(요약, 아티팩트 등)를 담는 구조 
 * (ImprovedPhaseTracker에서 사용)
 */
export interface PhaseResult {
  phaseId: number;
  summary: string;
  artifacts: string[];
  subtaskResults: Record<string, string>;
  executionTime: number;
}

/**
 * ImprovedPhaseTracker 전용 확장된 Phase 상태값
 */
export type ExtendedPhaseStatus = PhaseStatus | "in-progress" | "completed" | "skipped";

/**
 * Phase 실행 모드
 */
export enum PhaseExecutionMode {
  Sequential, // 순차 실행
  Parallel,   // 병렬 실행
  Conditional // 조건부 실행
}

/**
 * 조건부 Phase 실행 시 설정
 */
export interface ConditionalExecutionConfig {
  conditions: Record<number, () => Promise<boolean>>;
  defaultAction: 'skip' | 'execute';
}

/****************************************************************
 * 1) PhaseTracker (레거시)
 ****************************************************************/
export class PhaseTracker {
  private phases: PhaseState[] = [];
  private currentPhaseIndex = 0;

  /** Save tracker progress to .cline/phase-checkpoint.json */
  private async saveCheckpoint(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {return};

      const checkpointData = {
        phases: this.phases,
        currentPhaseIndex: this.currentPhaseIndex,
        originalPrompt: this.originalPrompt,
      };

      const checkpointPath = vscode.Uri.joinPath(
        workspaceFolder.uri,
        '.cline',
        'phase-checkpoint.json',
      );
      try {
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceFolder.uri, '.cline'));
      } catch {}
      await vscode.workspace.fs.writeFile(
        checkpointPath,
        new Uint8Array(Buffer.from(JSON.stringify(checkpointData, null, 2))),
      );
    } catch (error) {
      this.outputChannel.appendLine(`Error saving phase checkpoint: ${error}`);
    }
  }

  /** Restore tracker progress from .cline/phase-checkpoint.json if present */
  public static async fromCheckpoint(
    controller: Controller,
    outputChannel: vscode.OutputChannel,
  ): Promise<PhaseTracker | undefined> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {return undefined};

      const checkpointPath = vscode.Uri.joinPath(
        workspaceFolder.uri,
        '.cline',
        'phase-checkpoint.json',
      );
      const data = await vscode.workspace.fs.readFile(checkpointPath);
      const checkpoint = JSON.parse(data.toString());
      const tracker = new PhaseTracker(checkpoint.originalPrompt, controller, outputChannel);
      tracker['phases'] = checkpoint.phases;
      tracker['currentPhaseIndex'] = checkpoint.currentPhaseIndex;
      return tracker;
    } catch (error) {
      outputChannel.appendLine(`Error restoring phase checkpoint: ${error}`);
      return undefined;
    }
  }

  /**
   * @param originalPrompt 사용자 원본 프롬프트 (Plan Mode 에 넘길 내용)
   */
  constructor(
    private originalPrompt: string,
    private controller: Controller,
    private outputChannel: vscode.OutputChannel
  ) {
    // 첫 번째 Phase (Plan 단계) 구성
    this.phases.push({
      id: 1,
      prompt: originalPrompt,
      subtasks: [], // Plan phase엔 Subtask 없음
      complete: false,
    });
  }

  /** 
   * Plan 단계가 끝난 뒤 호출해서 실제 실행 Phase 목록을 채웁니다.
   */
  public addPhasesFromPlan(parsedPhases: Phase[]): void {
    parsedPhases.forEach((p) => {
      this.phases.push({
        id: p.index,
        prompt: p.phase_prompt,
        subtasks: p.subtasks.map((st) => ({
          description: st.description,
          completed: false,
        })),
        complete: false,
      });
    });
    this.outputChannel.appendLine(`PhaseTracker: ${parsedPhases.length} phases registered.`);
    this.saveCheckpoint().catch(()=>{});
  }

  /** 
   * 특정 Subtask를 완료 표시 
   */
  public completeSubtask(subtaskIdx: number): void {
    const phase = this.phases[this.currentPhaseIndex];
    if (phase.subtasks[subtaskIdx]) {
      phase.subtasks[subtaskIdx].completed = true;
      this.outputChannel.appendLine(
        `PhaseTracker: Phase ${phase.id} - Subtask #${subtaskIdx + 1} 완료`
      );
      this.saveCheckpoint().catch(()=>{});
    }
  }

  /** 
   * 현재 Phase를 완료 처리 
   */
  public markCurrentPhaseComplete(): void {
    const phase = this.phases[this.currentPhaseIndex];

    // 모든 서브태스크 완료 처리
    phase.subtasks.forEach((_, idx) => this.completeSubtask(idx));
    phase.complete = true;

    this.outputChannel.appendLine(
      `PhaseTracker: Phase ${phase.id} - ${phase.prompt} marked as completed`
    );
    this.saveCheckpoint().catch(()=>{});
  }

  /** 
   * 현재 Phase 전체 Subtask가 다 끝났는지
   */
  public isCurrentPhaseComplete(): boolean {
    const subs = this.currentSubtasks;
    // (레거시 구현에서는 "서브태스크가 한 개 이상 있고, 전부 완료" 라고 가정)
    return subs.length > 0 && subs.every((s) => s.completed);
  }

  /** 
   * 현재 Phase의 Subtask 리스트
   */
  public get currentSubtasks(): SubtaskState[] {
    return this.phases[this.currentPhaseIndex].subtasks;
  }

  /** 
   * 지금까지 만든 모든 Phase의 원본 prompt 배열
   */
  public getAllPhasePrompts(): string[] {
    return this.phases.map((p) => p.prompt);
  }

  /** 
   * 현재 Phase의 Phase 정의(Phase 타입에 맞춰 변환)
   */
  public get currentPhase(): Phase {
    const p = this.phases[this.currentPhaseIndex];
    // Phase 타입이 요구하는 필드에 맞춰 변환
    return {
      index: p.index ?? p.id,
      phase_prompt: p.phase_prompt ?? p.prompt,
      paths: p.paths ?? [],
      status: (p.status as PhaseStatus) ?? "pending",
      subtasks: p.subtasks.map((st) => ({
        description: st.description,
        completed: st.completed,
        type: (st.type as string) ?? "generic",
      })),
    };
  }

  /** 
   * 전체 Phase 수
   */
  public get totalPhases(): number {
    return this.phases.length;
  }

  /** 
   * 원본 프롬프트 반환 
   */
  public getOriginalPrompt(): string {
    return this.originalPrompt;
  }

  /** 
   * 다음 Phase가 남아있는지 여부 
   */
  public hasNextPhase(): boolean {
    return this.currentPhaseIndex < this.phases.length - 1;
  }

  /** 
   * 전체 Phase가 모두 끝났는지 
   */
  public allPhasesCompleted(): boolean {
    return this.phases.every((p) => p.complete);
  }

  /**
   * (레거시) 다음 Phase로 넘어가기
   * - 현재 Phase를 완료 처리하고,
   * - `controller`를 통해 새 대화 세션 생성 후 Prompt 전송
   */
  public async moveToNextPhase(contextSummary?: string): Promise<string | null> {
    // 1) 현 Phase 완료 표시
    this.phases[this.currentPhaseIndex].complete = true;

    // 2) 다음 Phase 인덱스로
    this.currentPhaseIndex++;
    if (this.currentPhaseIndex >= this.phases.length) {
      this.outputChannel.appendLine(`PhaseTracker: All phases completed.`);
      return null;
    }

    const next = this.currentPhase;

    // 3) 컨텍스트 요약 포함하여 다음 프롬프트 구성
    let nextPrompt = next.phase_prompt;
    if (contextSummary) {
      nextPrompt = [
        `# 이전 단계 요약:`,
        contextSummary,
        ``,
        `# 새로운 단계 (${next.index}/${this.phases.length}):`,
        next.phase_prompt,
      ].join('\n');
    }

    // 4) 컨트롤러로 새로운 대화 세션 준비 후, 메시지 전송
    this.outputChannel.appendLine(
      `PhaseTracker: Starting Phase ${next.index}: "${next.phase_prompt}"`
    );
    await this.controller.clearTask();
    await this.controller.postStateToWebview();
    // “새 대화” 버튼 누른 것처럼
    await this.controller.postMessageToWebview({
      type: 'action',
      action: 'chatButtonClicked',
    });
    // 실제 LLM에 전송
    await this.controller.postMessageToWebview({
      type: 'invoke',
      invoke: 'sendMessage',
      text: nextPrompt,
    });

    return nextPrompt;
  }
}

/****************************************************************
 * 2) ImprovedPhaseTracker (신규)
 ****************************************************************/
export class ImprovedPhaseTracker {
  private phases: PhaseState[] = [];
  private currentPhaseIndex = 0;
  private phaseResults: PhaseResult[] = [];
  private executionMode: PhaseExecutionMode = PhaseExecutionMode.Sequential;
  private executionConfig: any;
  private checkpointEnabled: boolean = true;
  private checkpointFrequency: 'phase' | 'subtask' | 'never' = 'phase';

  private phaseChangeListeners: ((phaseId: number, newStatus: ExtendedPhaseStatus) => void)[] = [];

  /**
   * 새로운 ImprovedPhaseTracker 생성
   * @param originalPrompt 사용자 원본 프롬프트 (Plan Mode 에 넘길 내용)
   * @param controller Controller
   * @param outputChannel VS Code 출력 채널
   */
  constructor(
    private originalPrompt: string,
    private controller: Controller,
    private outputChannel: vscode.OutputChannel
  ) {
    // 초기에는 'Plan' 역할의 Phase 1개 생성
    this.phases.push({
      id: 1,
      prompt: originalPrompt,
      subtasks: [],
      complete: false,
      status: "pending",
      index: 1,
      phase_prompt: originalPrompt,
      startTime: Date.now(),
    });
  }

  /**
   * Plan 단계가 끝난 뒤 호출해서 실제 실행 Phase 목록을 채움
   */
  public addPhasesFromPlan(parsedPhases: Phase[]): void {
    parsedPhases.forEach((p) => {
      this.phases.push({
        id: p.index,
        prompt: p.phase_prompt,
        subtasks: p.subtasks.map((st, idx) => ({
          id: `${p.index}-${idx}`,
          description: st.description,
          completed: false,
          type: st.type || 'generic',
        })),
        complete: false,
        status: "pending",
        index: p.index,
        phase_prompt: p.phase_prompt,
        paths: p.paths ?? [],
        dependencies: [], // 기본적으로 이전 단계에 의존
      });
    });

    // 기본적으로 2번째 Phase부터는 바로 이전 Phase를 의존성으로 설정
    for (let i = 2; i < this.phases.length; i++) {
      this.phases[i].dependencies = [i - 1];
    }

    this.outputChannel.appendLine(
      `ImprovedPhaseTracker: ${parsedPhases.length} phases registered.`
    );
  }

  /**
   * 특정 Subtask 완료
   */
  public completeSubtask(phaseId: number, subtaskId: string, result?: string): void {
    const phase = this.phases.find((p) => p.id === phaseId);
    if (!phase) return;
    
    const subtask = phase.subtasks.find((s) => s.id === subtaskId);
    if (subtask) {
      subtask.completed = true;
      subtask.result = result;
      subtask.endTime = Date.now();

      this.outputChannel.appendLine(
        `ImprovedPhaseTracker: Phase ${phaseId} - Subtask ${subtaskId} completed`
      );

      // 모든 Subtask가 끝났다면 Phase도 자동 완료
      if (phase.subtasks.every((s) => s.completed)) {
        this.completePhase(phaseId);
      }

      // Checkpoint 주기가 'subtask'면 저장
      if (this.checkpointEnabled && this.checkpointFrequency === 'subtask') {
        this.saveCheckpoint();
      }
    }
  }

  /**
   * 현재 Phase를 완료 처리
   */
  public markCurrentPhaseComplete(summary?: string): void {
    this.completePhase(this.phases[this.currentPhaseIndex].id, summary);
  }

  /**
   * 특정 Phase 완료 처리
   */
  public completePhase(phaseId: number, summary?: string): void {
    const phase = this.phases.find((p) => p.id === phaseId);
    if (!phase) return;

    // 아직 완료되지 않은 서브태스크 모두 완료
    phase.subtasks.forEach((st) => {
      if (!st.completed) {
        st.completed = true;
        st.endTime = Date.now();
      }
    });

    // Phase 완료 표시
    phase.complete = true;
    phase.status = "completed";
    phase.endTime = Date.now();

    // 결과 저장
    const result: PhaseResult = {
      phaseId: phase.id,
      summary: summary || '',
      artifacts: phase.artifacts || [],
      subtaskResults: phase.subtasks.reduce((acc, st) => {
        acc[st.id ?? ''] = st.result ?? '';
        return acc;
      }, {} as Record<string, string>),
      executionTime: (phase.endTime || Date.now()) - (phase.startTime || 0),
    };
    this.phaseResults.push(result);

    this.outputChannel.appendLine(
      `ImprovedPhaseTracker: Phase ${phase.id} - "${phase.prompt}" marked as completed`
    );

    // 리스너 알림
    this.notifyPhaseChange(phase.id, "completed");

    // Checkpoint 주기가 'phase'면 저장
    if (this.checkpointEnabled && this.checkpointFrequency === 'phase') {
      this.saveCheckpoint();
    }
  }

  /**
   * 현재 Phase에 아티팩트 파일 추가
   */
  public addArtifact(filePath: string): void {
    const phase = this.phases[this.currentPhaseIndex];
    if (!phase.artifacts) {
      phase.artifacts = [];
    }
    phase.artifacts.push(filePath);
  }

  /**
   * Phase 상태 변경 리스너 등록
   */
  public onPhaseChange(
    listener: (phaseId: number, newStatus: ExtendedPhaseStatus) => void
  ): void {
    this.phaseChangeListeners.push(listener);
  }

  /**
   * Phase 상태 변경 리스너 호출
   */
  private notifyPhaseChange(
    phaseId: number,
    newStatus: ExtendedPhaseStatus
  ): void {
    this.phaseChangeListeners.forEach((listener) => {
      try {
        listener(phaseId, newStatus);
      } catch (error) {
        this.outputChannel.appendLine(`Error in phase change listener: ${error}`);
      }
    });
  }

  /**
   * Phase 실행 모드 설정 (순차/병렬/조건부 등)
   */
  public setExecutionMode(mode: PhaseExecutionMode, config?: any): void {
    this.executionMode = mode;
    this.executionConfig = config;
  }

  /**
   * 체크포인트(중간 저장) 설정
   */
  public configureCheckpointing(
    enabled: boolean,
    frequency: 'phase' | 'subtask' | 'never'
  ): void {
    this.checkpointEnabled = enabled;
    this.checkpointFrequency = frequency;
  }

  public get totalPhases(): number {
    return this.phases.length;
  }

  public getOriginalPrompt(): string {
    return this.originalPrompt;
  }

  /**
   * 현재 Phase가 모두 완료되었는지 (서브태스크 전부?)
   */
  public isCurrentPhaseComplete(): boolean {
    const phase = this.phases[this.currentPhaseIndex];
    return phase.complete;
  }

  public get currentSubtasks(): SubtaskState[] {
    return this.phases[this.currentPhaseIndex].subtasks;
  }

  public getAllPhasePrompts(): string[] {
    return this.phases.map((p) => p.prompt);
  }

  /**
   * 현재 Phase 정의(Phase 타입으로 변환)
   */
  public get currentPhase(): Phase {
    const p = this.phases[this.currentPhaseIndex];
    return {
      index: p.index ?? p.id,
      phase_prompt: p.phase_prompt ?? p.prompt,
      paths: p.paths ?? [],
      status: p.status as PhaseStatus, // 넓은 타입이라 단언
      subtasks: p.subtasks.map((st) => ({
        description: st.description,
        completed: st.completed,
        type: st.type ?? 'generic',
      })),
    };
  }

  /** 모든 Phase가 완료되었는지 */
  public allPhasesCompleted(): boolean {
    return this.phases.every((p) => p.complete);
  }

  /** 다음 Phase가 존재하는지 */
  public hasNextPhase(): boolean {
    return this.currentPhaseIndex < this.phases.length - 1;
  }

  /**
   * 이전 Phase 요약을 포함해 다음 Phase용 prompt를 구성
   */
  private buildNextPhasePrompt(contextSummary: string | undefined, next: Phase): string {
    if (!contextSummary) {
      return next.phase_prompt;
    }
    return [
      `# Previous Phase Summary:`,
      contextSummary,
      ``,
      `# Current Phase (${next.index}/${this.phases.length}):`,
      next.phase_prompt,
    ].join('\n');
  }

  /**
   * 다음 Phase로 이동
   * - 현재 Phase는 자동 완료처리
   * - 다음 Phase 시작
   */
  public async moveToNextPhase(contextSummary?: string): Promise<string | null> {
    // 현재 Phase 완료
    this.completePhase(this.phases[this.currentPhaseIndex].id, contextSummary);

    // 다음 Phase 인덱스로
    this.currentPhaseIndex++;
    if (this.currentPhaseIndex >= this.phases.length) {
      this.outputChannel.appendLine(`ImprovedPhaseTracker: All phases completed.`);
      return null;
    }

    // 다음 Phase 시작
    const phaseState = this.phases[this.currentPhaseIndex];
    phaseState.status = "in-progress";
    phaseState.startTime = Date.now();

    const next = this.currentPhase;
    const nextPrompt = this.buildNextPhasePrompt(contextSummary, next);

    // 상태 변경 알림
    this.notifyPhaseChange(phaseState.id, "in-progress");

    // Controller로 새 대화 세션 + 메시지 전송
    this.outputChannel.appendLine(
      `ImprovedPhaseTracker: Starting Phase ${phaseState.index}: "${phaseState.phase_prompt}"`
    );
    await this.controller.clearTask();
    await this.controller.postStateToWebview();
    await this.controller.postMessageToWebview({
      type: 'action',
      action: 'chatButtonClicked',
    });
    await this.controller.postMessageToWebview({
      type: 'invoke',
      invoke: 'sendMessage',
      text: nextPrompt,
    });

    return nextPrompt;
  }

  /**
   * (예시) 모든 Phase를 순차 실행
   */
  public async executeSequentially(): Promise<void> {
    while (this.currentPhaseIndex < this.phases.length) {
      const phaseState = this.phases[this.currentPhaseIndex];

      if (!phaseState.complete) {
        await this.executePhase(phaseState.id);
      }

      if (this.hasNextPhase()) {
        await this.moveToNextPhase();
      } else {
        break;
      }
    }
  }

  /**
   * (예시) 병렬 실행 (간단한 의존성 고려)
   */
  public async executeParallel(): Promise<void> {
    const phaseGroups: number[][] = [];
    const remaining = new Set(this.phases.map((p) => p.id));

    // 의존성 없는 것끼리 그룹화
    while (remaining.size > 0) {
      const group: number[] = [];
      for (const phaseId of remaining) {
        const phase = this.phases.find((p) => p.id === phaseId)!;
        const depsMet =
          !phase.dependencies ||
          phase.dependencies.length === 0 ||
          phase.dependencies.every((depId) => {
            const dep = this.phases.find((p) => p.id === depId);
            return dep && dep.complete;
          });
        if (depsMet) {
          group.push(phaseId);
        }
      }
      if (group.length === 0) {
        this.outputChannel.appendLine(`Warning: Dependency cycle detected in phases`);
        break;
      }
      group.forEach((id) => remaining.delete(id));
      phaseGroups.push(group);
    }

    // 그룹 단위 병렬 실행
    for (const group of phaseGroups) {
      if (group.length === 1) {
        await this.executePhase(group[0]);
      } else {
        await Promise.all(group.map((phaseId) => this.executePhase(phaseId)));
      }
    }
  }

  /**
   * (예시) 조건부 실행
   */
  public async executeConditionally(): Promise<void> {
    if (
      !this.executionConfig ||
      !(this.executionConfig as ConditionalExecutionConfig).conditions
    ) {
      this.outputChannel.appendLine(`Error: Missing conditional execution configuration`);
      return;
    }
    const config = this.executionConfig as ConditionalExecutionConfig;

    for (let i = this.currentPhaseIndex; i < this.phases.length; i++) {
      const phase = this.phases[i];

      if (config.conditions[phase.id]) {
        const shouldExecute = await config.conditions[phase.id]();
        if (shouldExecute) {
          await this.executePhase(phase.id);
        } else {
          this.outputChannel.appendLine(`Skipping Phase ${phase.id} based on condition`);
          phase.status = "skipped";
          phase.complete = true;
          this.notifyPhaseChange(phase.id, "skipped");
        }
      } else {
        // 조건이 없으면 defaultAction
        if (config.defaultAction === 'execute') {
          await this.executePhase(phase.id);
        } else {
          this.outputChannel.appendLine(`Skipping Phase ${phase.id} (default action)`);
          phase.status = "skipped";
          phase.complete = true;
          this.notifyPhaseChange(phase.id, "skipped");
        }
      }
    }
  }

  /**
   * 단일 Phase를 실제로 실행(시뮬레이션 예시)
   */
  private async executePhase(phaseId: number): Promise<void> {
    const phase = this.phases.find((p) => p.id === phaseId);
    if (!phase || phase.complete) return;

    phase.status = "in-progress";
    phase.startTime = Date.now();
    this.notifyPhaseChange(phaseId, "in-progress");

    this.outputChannel.appendLine(
      `ImprovedPhaseTracker: Executing Phase ${phaseId}: "${phase.prompt}"`
    );

    // 실제론 controller를 통해 LLM에 명령. 여기선 0.5초 지연 후 완료 처리
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.completePhase(phaseId);
  }

  /**
   * Phase 실행 시간
   */
  public getPhaseExecutionTime(phaseId: number): number {
    const phase = this.phases.find((p) => p.id === phaseId);
    if (!phase) return 0;
    const endTime = phase.endTime || Date.now();
    const startTime = phase.startTime || endTime;
    return endTime - startTime;
  }

  /**
   * 모든 Phase의 총 실행 시간
   */
  public getTotalExecutionTime(): number {
    return this.phases.reduce((total, p) => {
      return total + this.getPhaseExecutionTime(p.id);
    }, 0);
  }

  /**
   * 실행 보고서 생성
   */
  public generatePhaseExecutionReport(): any {
    return {
      totalPhases: this.phases.length,
      completedPhases: this.phases.filter((p) => p.complete).length,
      totalExecutionTime: this.getTotalExecutionTime(),
      phaseDetails: this.phases.map((p) => ({
        id: p.id,
        prompt: p.prompt,
        status: p.status,
        executionTime: this.getPhaseExecutionTime(p.id),
        subtasks: p.subtasks.map((st) => ({
          id: st.id,
          description: st.description,
          completed: st.completed,
          result: st.result,
        })),
        artifacts: p.artifacts || [],
      })),
    };
  }

  /**
   * 체크포인트 (phase-checkpoint.json) 저장
   */
  private async saveCheckpoint(): Promise<void> {
    try {
      const checkpointData = {
        phases: this.phases,
        currentPhaseIndex: this.currentPhaseIndex,
        phaseResults: this.phaseResults,
        originalPrompt: this.originalPrompt,
        executionMode: this.executionMode,
        executionConfig: this.executionConfig,
      };

      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;

      const checkpointPath = vscode.Uri.joinPath(
        workspaceFolder.uri,
        '.cline',
        'phase-checkpoint.json'
      );

      // 디렉토리 생성 시도
      try {
        await vscode.workspace.fs.createDirectory(
          vscode.Uri.joinPath(workspaceFolder.uri, '.cline')
        );
      } catch {
        // 이미 존재하면 무시
      }

      // 파일 쓰기
      await vscode.workspace.fs.writeFile(
        checkpointPath,
        new Uint8Array(Buffer.from(JSON.stringify(checkpointData, null, 2)))
      );

      this.outputChannel.appendLine(`ImprovedPhaseTracker: Checkpoint saved`);
    } catch (error) {
      this.outputChannel.appendLine(`Error saving checkpoint: ${error}`);
    }
  }

  /**
   * 체크포인트에서 복원
   */
  public static async fromCheckpoint(
    controller: Controller,
    outputChannel: vscode.OutputChannel
  ): Promise<ImprovedPhaseTracker | undefined> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return undefined;

      const checkpointPath = vscode.Uri.joinPath(
        workspaceFolder.uri,
        '.cline',
        'phase-checkpoint.json'
      );

      // 파일 읽기
      const data = await vscode.workspace.fs.readFile(checkpointPath);
      const checkpoint = JSON.parse(data.toString());

      // 새로운 트래커 생성 + 상태 복원
      const tracker = new ImprovedPhaseTracker(
        checkpoint.originalPrompt,
        controller,
        outputChannel
      );
      tracker['phases'] = checkpoint.phases;
      tracker['currentPhaseIndex'] = checkpoint.currentPhaseIndex;
      tracker['phaseResults'] = checkpoint.phaseResults;
      tracker['executionMode'] = checkpoint.executionMode;
      tracker['executionConfig'] = checkpoint.executionConfig;

      outputChannel.appendLine(`ImprovedPhaseTracker: Restored from checkpoint`);
      return tracker;
    } catch (error) {
      outputChannel.appendLine(`Error restoring from checkpoint: ${error}`);
      return undefined;
    }
  }

  /**
   * 강제로 현재 Phase 완수 처리
   * (비정상 종료 시 사용하는 백업 메서드)
   */
  public forceCompleteCurrentPhase(summary?: string): void {
    const phase = this.phases[this.currentPhaseIndex];

    // 서브태스크 전부 완료
    phase.subtasks.forEach((st) => {
      st.completed = true;
      st.endTime = Date.now();
    });

    // Phase 완료 처리
    phase.complete = true;
    phase.status = "completed";
    phase.endTime = Date.now();

    this.outputChannel.appendLine(
      `Force-completed phase ${phase.id}: ${phase.prompt}`
    );

    // 리스너 알림
    this.notifyPhaseChange(phase.id, "completed");

    // 요약이 있다면 결과로도 저장
    if (summary) {
      this.phaseResults.push({
        phaseId: phase.id,
        summary,
        artifacts: phase.artifacts || [],
        subtaskResults: phase.subtasks.reduce((acc, st) => {
          acc[st.id ?? ''] = st.result || `Completed ${st.description}`;
          return acc;
        }, {} as Record<string, string>),
        executionTime: phase.endTime! - (phase.startTime || 0),
      });
    }
  }
}

/****************************************************************
 * 3) PhaseTrackerAdapter
 *    - 기존 PhaseTracker + 새로운 ImprovedPhaseTracker를
 *      함께 사용하기 위한 어댑터.
 ****************************************************************/
export class PhaseTrackerAdapter {
  private legacyTracker: PhaseTracker;
  private improvedTracker: ImprovedPhaseTracker;
  private useImproved: boolean;
  private outputChannel: vscode.OutputChannel;

  constructor(
    originalPrompt: string,
    controller: Controller,
    outputChannel: vscode.OutputChannel,
    useImproved: boolean = true
  ) {
    this.legacyTracker = new PhaseTracker(originalPrompt, controller, outputChannel);
    this.improvedTracker = new ImprovedPhaseTracker(originalPrompt, controller, outputChannel);
    this.useImproved = useImproved;
    this.outputChannel = outputChannel;
  }

  /** Plan 단계가 끝난 뒤, 실제 실행 Phase 목록을 트래커들에 등록 */
  public addPhasesFromPlan(parsedPhases: Phase[]): void {
    this.legacyTracker.addPhasesFromPlan(parsedPhases);
    this.improvedTracker.addPhasesFromPlan(parsedPhases);
  }

  /** 
   * 특정 Subtask 완료
   *  - legacyTracker는 (subtaskIdx만 사용)
   *  - improvedTracker는 (phaseId + subtaskId) 필요
   */
  public completeSubtask(subtaskIdx: number): void {
    // (1) 레거시 트래커 
    this.legacyTracker.completeSubtask(subtaskIdx);

    // (2) 개선된 트래커
    //     현재 Phase의 index & subtaskId를 만들어서 호출
    const currentPhase = this.improvedTracker.currentPhase;
    if (currentPhase.subtasks[subtaskIdx]) {
      const subtaskId = `${currentPhase.index}-${subtaskIdx}`;
      this.improvedTracker.completeSubtask(currentPhase.index, subtaskId);
    }
  }

  /** 
   * 현재 Phase를 완료 처리 
   */
  public markCurrentPhaseComplete(summary?: string): void {
    // (1) 레거시
    this.legacyTracker.markCurrentPhaseComplete();

    // (2) 개선된
    this.improvedTracker.markCurrentPhaseComplete(summary);

    // 혹시 남아있는 서브태스크가 있으면 정리
    const subtasks = this.currentSubtasks;
    for (let i = 0; i < subtasks.length; i++) {
      if (!subtasks[i].completed) {
        this.completeSubtask(i);
      }
    }

    // 강제로 완료되지 않았는지 확인
    if (!this.improvedTracker.isCurrentPhaseComplete()) {
      this.outputChannel?.appendLine(
        "Warning: Phase was not properly marked as complete. Forcing complete status."
      );
      // useImproved가 true라면 ImprovedTracker 기준으로 강제 완료
      if (this.useImproved) {
        this.improvedTracker.forceCompleteCurrentPhase(summary || "Phase forcibly completed");
      } else {
        this.legacyTracker.markCurrentPhaseComplete();
      }
    }
  }

  /** 전체 Phase 수 */
  public get totalPhases(): number {
    return this.useImproved
      ? this.improvedTracker.totalPhases
      : this.legacyTracker.totalPhases;
  }

  /** 원본 프롬프트 */
  public getOriginalPrompt(): string {
    return this.useImproved
      ? this.improvedTracker.getOriginalPrompt()
      : this.legacyTracker.getOriginalPrompt();
  }

  /** 현재 Phase 전체 서브태스크가 완료되었는지 */
  public isCurrentPhaseComplete(): boolean {
    return this.useImproved
      ? this.improvedTracker.isCurrentPhaseComplete()
      : this.legacyTracker.isCurrentPhaseComplete();
  }

  /** 현재 Phase의 Subtask들 */
  public get currentSubtasks(): SubtaskState[] {
    return this.useImproved
      ? this.improvedTracker.currentSubtasks
      : this.legacyTracker.currentSubtasks;
  }

  /** 모든 Phase의 Prompt 배열 */
  public getAllPhasePrompts(): string[] {
    return this.useImproved
      ? this.improvedTracker.getAllPhasePrompts()
      : this.legacyTracker.getAllPhasePrompts();
  }

  /** 현재 Phase */
  public get currentPhase(): Phase {
    return this.useImproved
      ? this.improvedTracker.currentPhase
      : this.legacyTracker.currentPhase;
  }

  /** 다음 Phase 존재 여부 */
  public hasNextPhase(): boolean {
    return this.useImproved
      ? this.improvedTracker.hasNextPhase()
      : this.legacyTracker.hasNextPhase();
  }

  /** 모든 Phase가 완료되었는지 */
  public allPhasesCompleted(): boolean {
    return this.useImproved
      ? this.improvedTracker.allPhasesCompleted()
      : this.legacyTracker.allPhasesCompleted();
  }

  /**
   * 다음 Phase로 넘어가기
   */
  public async moveToNextPhase(contextSummary?: string): Promise<string | null> {
    if (this.useImproved) {
      return this.improvedTracker.moveToNextPhase(contextSummary);
    } else {
      return this.legacyTracker.moveToNextPhase(contextSummary);
    }
  }

  /**
   * (Improved용) 아티팩트 추가
   */
  public addArtifact(filePath: string): void {
    this.improvedTracker.addArtifact(filePath);
  }

  /**
   * (Improved용) 체크포인트 설정
   */
  public configureCheckpointing(
    enabled: boolean,
    frequency: 'phase' | 'subtask' | 'never'
  ): void {
    this.improvedTracker.configureCheckpointing(enabled, frequency);
  }

  /**
   * (Improved용) 실행 모드 설정
   */
  public setExecutionMode(mode: PhaseExecutionMode, config?: any): void {
    this.improvedTracker.setExecutionMode(mode, config);
  }

  /**
   * (Improved용) 실행 보고서 생성
   */
  public generatePhaseExecutionReport(): any {
    return this.improvedTracker.generatePhaseExecutionReport();
  }

  /**
   * (옵션) 어느 트래커를 사용할지 선택
   */
  public selectImprovedTracker(useImproved: boolean): void {
    this.useImproved = useImproved;
  }

  /**
   * 레거시/개선된 트래커 참조(필요하다면)
   */
  public getLegacyTracker(): PhaseTracker {
    return this.legacyTracker;
  }
  public getImprovedTracker(): ImprovedPhaseTracker {
    return this.improvedTracker;
  }
}
