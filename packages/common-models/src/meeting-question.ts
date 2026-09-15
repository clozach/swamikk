export interface MeetingQuestionCandidate {
    label: string;
    text: string;
}

export interface MeetingQuestionCandidateGroup {
    title: string;
    options: MeetingQuestionCandidate[];
}

export interface MeetingQuestionLocation {
    path: string;
    componentId: string;
    label: string;
}

export interface MeetingQuestion {
    id: string;
    number: number;
    title: string;
    group: "start" | "optional" | "humanitix";
    context: string;
    candidateGroups: MeetingQuestionCandidateGroup[];
    locations: MeetingQuestionLocation[];
}

export interface MeetingQuestionSetInput {
    id: string;
    title: string;
    intro: string;
    questions: MeetingQuestion[];
}

export interface MeetingQuestionSet extends MeetingQuestionSetInput {
    revision: number;
    updatedAt: string;
}

export interface MeetingQuestionSetWrite {
    set: MeetingQuestionSetInput;
    expectedRevision: number;
}

export interface MeetingQuestionViewer {
    userId: string;
    name: string;
}

export type MeetingAnswerAuthor =
    | ({ kind: "account" } & MeetingQuestionViewer)
    | { kind: "removed" };

export interface MeetingAnswerHistoryEntry {
    revision: number;
    baseRevision: number;
    mutationId: string;
    text: string;
    at: string;
}

export interface MeetingQuestionAnswer {
    id: string;
    setId: string;
    questionId: string;
    author: MeetingAnswerAuthor;
    text: string;
    revision: number;
    history: MeetingAnswerHistoryEntry[];
    updatedAt: string;
}

export interface MeetingQuestionsSnapshot {
    sets: MeetingQuestionSet[];
    answers: MeetingQuestionAnswer[];
    viewer: MeetingQuestionViewer;
}

export interface MeetingAnswerInput {
    setId: string;
    questionId: string;
    text: string;
    expectedRevision: number;
    mutationId: string;
}

export type MeetingAnswerSaveResult =
    | {
          kind: "saved";
          answer: MeetingQuestionAnswer;
          replayed: boolean;
          appliedRevision: number;
      }
    | {
          kind: "conflict";
          current: MeetingQuestionAnswer | null;
          message: string;
      };
