export type ClassChoice = { cohortId: string; fingerprint: string };
export type ClassChoices =
    | { kind: "ordinary" }
    | {
          kind: "class";
          choices: Array<ClassChoice & { name: string; startAt: string }>;
      };
export type BookedClass = ClassChoice & {
    cohortDocumentId: string;
    name: string;
    startAt: Date;
    revision: number;
};
