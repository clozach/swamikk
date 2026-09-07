jest.mock("@/auth", () => ({ auth: { api: { getSession: jest.fn() } } }));
import { NextRequest } from "next/server";
import DomainModel from "@/models/Domain";
import User from "@/models/User";
import { GET, POST } from "../[token]/route";
import { recordActivity } from "@/lib/record-activity";

jest.mock("@/lib/record-activity", () => ({ recordActivity: jest.fn() }));
jest.mock("@/lib/trigger-sequences", () => ({ triggerSequences: jest.fn() }));
let domain: any, user: any;
const params = (token: string) => ({ params: Promise.resolve({ token }) });
function request(cookie = "") {
    return new NextRequest(
        "https://school.example/api/unsubscribe/news-token",
        { headers: { domain: domain.name, cookie } },
    );
}
beforeEach(async () => {
    domain = await DomainModel.create({
        name: `unsubscribe-${Date.now()}-${Math.random()}`,
        email: "owner@example.com",
    });
    user = await User.create({
        domain: domain._id,
        userId: `member-${Math.random()}`,
        email: "news@example.com",
        unsubscribeToken: "news-token",
        subscribedToUpdates: true,
        active: true,
    });
    (recordActivity as jest.Mock).mockClear();
});
it("confirms without login, repeats safely and retains service/account facts", async () => {
    const result = await GET(request(), params("news-token"));
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toContain("text/html");
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(result.headers.get("referrer-policy")).toBe("no-referrer");
    const body = await result.text();
    expect(body).toContain("You’re unsubscribed from news");
    expect(body).toContain("Sign-in codes, receipts");
    expect(body).not.toContain(user.email);
    const repeat = await POST(request(), params("news-token"));
    expect(repeat.status).toBe(200);
    expect(recordActivity).toHaveBeenCalledTimes(1);
    const updated = await User.findById(user._id);
    expect(updated!.subscribedToUpdates).toBe(false);
    expect(updated!.active).toBe(true);
    expect(updated!.email).toBe(user.email);
});
it("does not expose token existence or cross tenant subscribers", async () => {
    expect((await GET(request(), params("unknown"))).status).toBe(200);
    expect((await User.findById(user._id))!.subscribedToUpdates).toBe(true);
    const other = await DomainModel.create({
        name: `other-${Date.now()}`,
        email: "other@example.com",
    });
    const otherRequest = new NextRequest(
        "https://other.example/api/unsubscribe/news-token",
        { headers: { domain: other.name } },
    );
    await POST(otherRequest, params("news-token"));
    expect((await User.findById(user._id))!.subscribedToUpdates).toBe(true);
});
it("refuses even unsubscribe through an active or invalid Mimic cookie", async () => {
    expect(
        (
            await GET(
                request("courselit.member-mimic=invalid"),
                params("news-token"),
            )
        ).status,
    ).toBe(403);
    expect((await User.findById(user._id))!.subscribedToUpdates).toBe(true);
});
