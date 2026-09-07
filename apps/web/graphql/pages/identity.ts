/** Historical proposal links bind to one result, even if its route is later reused. */
export function expectedPageIdentity(documentId?: string | null) {
    if (documentId === undefined || documentId === null) return {};
    if (!/^[a-f0-9]{24}$/.test(documentId))
        throw new Error("Invalid page identity.");
    return { _id: documentId };
}
