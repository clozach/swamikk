/** @jest-environment node */
import {
    anahataDemoImportPlan,
    importAnahataDemoBlogs,
} from "../../../.migrations/anahata-demo-import";
import CourseModel from "@/models/Course";
import { createCourse, updateCourse } from "../logic";
import constants from "@/config/constants";

jest.mock("@/models/Course", () => ({
    __esModule: true,
    default: { findOne: jest.fn() },
}));
jest.mock("../logic", () => ({
    createCourse: jest.fn(),
    updateCourse: jest.fn(),
}));
const ctx = {
    subdomain: { _id: "demo-school" },
    user: { permissions: [constants.permissions.manageAnyCourse] },
} as any;

beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(CourseModel.findOne).mockResolvedValue(null);
    jest.mocked(createCourse).mockImplementation(
        async ({ title }) => ({ courseId: title }) as any,
    );
    jest.mocked(updateCourse).mockResolvedValue({} as any);
});

it("prepares the source order without applying or publishing anything", () => {
    expect(anahataDemoImportPlan().map((post) => post.sourceId)).toEqual([
        14802, 14794, 14556, 14550, 14443,
    ]);
    expect(
        anahataDemoImportPlan().every((post) => post.published === false),
    ).toBe(true);
    expect(createCourse).not.toHaveBeenCalled();
    expect(updateCourse).not.toHaveBeenCalled();
});

it("creates drafts through the normal APIs and skips source-tagged records on a rerun", async () => {
    const result = await importAnahataDemoBlogs(ctx);
    expect(result).toHaveLength(5);
    expect(createCourse).toHaveBeenCalledTimes(5);
    expect(jest.mocked(createCourse).mock.calls[0][0].title).toBe(
        "The “Kiwi Yogi” Nourish Bowl",
    );
    for (const [patch] of jest.mocked(updateCourse).mock.calls) {
        expect(patch).not.toHaveProperty("published");
        expect(patch.tags).toContain("demo:anahata");
        expect(patch.description).toContain("Read the original article");
    }
    jest.clearAllMocks();
    jest.mocked(CourseModel.findOne).mockResolvedValue({
        courseId: "existing-human-edited",
    } as any);
    const repeated = await importAnahataDemoBlogs(ctx);
    expect(
        repeated.every((item) => item.disposition === "existing-skipped"),
    ).toBe(true);
    expect(createCourse).not.toHaveBeenCalled();
    expect(updateCourse).not.toHaveBeenCalled();
});
