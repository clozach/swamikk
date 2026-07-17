"use client";

import { useCallback, useEffect, useState } from "react";
import { FetchBuilder } from "@courselit/utils";
import type { Address } from "@courselit/common-models";
import {
    Table,
    TableBody,
    TableHead,
    TableRow,
    Menu2,
    MenuItem,
    Select,
    useToast,
} from "@courselit/components-library";
import { MoreVert } from "@courselit/icons";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import {
    TOAST_TITLE_ERROR,
    TOAST_TITLE_SUCCESS,
    COUPONS_SECTION_HEADER,
    COUPONS_SECTION_SUBHEADER,
    COUPONS_TABLE_HEADER_DISCOUNT,
    COUPONS_TABLE_HEADER_DURATION,
    COUPONS_TABLE_HEADER_CODES,
    COUPONS_TABLE_HEADER_ACTIONS,
    COUPONS_TABLE_EMPTY,
    COUPONS_NO_CODES,
    COUPON_CONTEXT_MENU_DELETE,
    COUPON_DELETE_POPUP_HEADER,
    COUPON_DELETE_POPUP_DESC,
    COUPON_CODE_DEACTIVATE,
    COUPON_CODE_INACTIVE_BADGE,
    COUPON_CREATE_FORM_HEADER,
    COUPON_FIELD_DISCOUNT_TYPE,
    COUPON_DISCOUNT_TYPE_PERCENT,
    COUPON_DISCOUNT_TYPE_AMOUNT,
    COUPON_FIELD_PERCENT_OFF,
    COUPON_FIELD_AMOUNT_OFF,
    COUPON_FIELD_DURATION,
    COUPON_DURATION_ONCE,
    COUPON_DURATION_REPEATING,
    COUPON_DURATION_FOREVER,
    COUPON_FIELD_DURATION_MONTHS,
    COUPON_FIELD_NAME,
    COUPON_CREATE_BUTTON,
    COUPON_CREATED_TOAST,
    COUPON_DELETED_TOAST,
    PROMO_CODE_ADD,
    PROMO_CODE_CREATED_TOAST,
    PROMO_CODE_DEACTIVATED_TOAST,
    FIRST_MONTH_FREE_HEADER,
    FIRST_MONTH_FREE_DESC,
    FIRST_MONTH_FREE_BUTTON,
    FIRST_MONTH_FREE_CREATED_TOAST,
    PROMO_CODE_FIELD_CODE,
} from "@ui-config/strings";

interface PromotionCode {
    id: string;
    code: string;
    active: boolean;
    couponId?: string | null;
}

interface Coupon {
    id: string;
    name?: string | null;
    percentOff?: number | null;
    amountOff?: number | null;
    currency?: string | null;
    duration: string;
    durationInMonths?: number | null;
    timesRedeemed?: number | null;
    valid?: boolean | null;
    promotionCodes?: PromotionCode[];
}

type DiscountType = "percent" | "amount";
type Duration = "once" | "repeating" | "forever";

interface CouponsManagerProps {
    address: Address;
    currencyISOCode?: string;
}

const COUPON_FIELDS = `
    id
    name
    percentOff
    amountOff
    currency
    duration
    durationInMonths
    timesRedeemed
    valid
    promotionCodes {
        id
        code
        active
        couponId
    }
`;

const formatMoney = (amountOff: number, currency?: string | null) =>
    `${(currency || "").toUpperCase()} ${(amountOff / 100).toFixed(2)}`.trim();

const formatDiscount = (coupon: Coupon) => {
    if (coupon.percentOff != null) {
        return `${coupon.percentOff}% off`;
    }
    if (coupon.amountOff != null) {
        return `${formatMoney(coupon.amountOff, coupon.currency)} off`;
    }
    return "—";
};

const formatDuration = (coupon: Coupon) => {
    switch (coupon.duration) {
        case "once":
            return COUPON_DURATION_ONCE;
        case "forever":
            return COUPON_DURATION_FOREVER;
        case "repeating":
            return `${COUPON_DURATION_REPEATING} (${coupon.durationInMonths} months)`;
        default:
            return coupon.duration;
    }
};

export default function CouponsManager({
    address,
    currencyISOCode,
}: CouponsManagerProps) {
    const { toast } = useToast();
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(false);
    const [working, setWorking] = useState(false);

    const [discountType, setDiscountType] = useState<DiscountType>("percent");
    const [percentOff, setPercentOff] = useState("");
    const [amountOff, setAmountOff] = useState("");
    const [duration, setDuration] = useState<Duration>("once");
    const [durationInMonths, setDurationInMonths] = useState("");
    const [couponName, setCouponName] = useState("");
    const [firstMonthFreeCode, setFirstMonthFreeCode] = useState("");

    const graph = useCallback(
        async (query: string, variables?: Record<string, unknown>) => {
            const builder = new FetchBuilder()
                .setUrl(`${address.backend}/api/graph`)
                .setIsGraphQLEndpoint(true);
            const request = variables
                ? builder.setPayload({ query, variables }).build()
                : builder.setPayload(query).build();
            return request.exec();
        },
        [address.backend],
    );

    const notifyError = useCallback(
        (err: any) =>
            toast({
                title: TOAST_TITLE_ERROR,
                description: err?.message || String(err),
                variant: "destructive",
            }),
        [toast],
    );

    const notifySuccess = useCallback(
        (description: string) =>
            toast({ title: TOAST_TITLE_SUCCESS, description }),
        [toast],
    );

    const loadCoupons = useCallback(async () => {
        setLoading(true);
        try {
            const response = await graph(
                `query { coupons: getCoupons { ${COUPON_FIELDS} } }`,
            );
            if (response.coupons) {
                setCoupons(response.coupons);
            }
        } catch (err: any) {
            notifyError(err);
        } finally {
            setLoading(false);
        }
    }, [graph, notifyError]);

    useEffect(() => {
        loadCoupons();
    }, [loadCoupons]);

    const resetCreateForm = () => {
        setPercentOff("");
        setAmountOff("");
        setDurationInMonths("");
        setCouponName("");
        setDiscountType("percent");
        setDuration("once");
    };

    const handleCreateCoupon = async (event: React.FormEvent) => {
        event.preventDefault();

        const input: Record<string, unknown> = { duration };
        if (couponName.trim()) {
            input.name = couponName.trim();
        }
        if (discountType === "percent") {
            const value = parseFloat(percentOff);
            if (!(value > 0 && value <= 100)) {
                notifyError({ message: COUPON_FIELD_PERCENT_OFF });
                return;
            }
            input.percentOff = value;
        } else {
            const value = parseFloat(amountOff);
            if (!(value > 0)) {
                notifyError({ message: COUPON_FIELD_AMOUNT_OFF });
                return;
            }
            // Convert the admin-entered major units to the smallest currency
            // unit Stripe expects (mirrors payments-new/stripe-payment.ts).
            input.amountOff = Math.round(value * 100);
        }
        if (duration === "repeating") {
            const months = parseInt(durationInMonths, 10);
            if (!(months > 0)) {
                notifyError({ message: COUPON_FIELD_DURATION_MONTHS });
                return;
            }
            input.durationInMonths = months;
        }

        setWorking(true);
        try {
            await graph(
                `mutation CreateCoupon($input: CouponCreateInput!) {
                    createCoupon(input: $input) { id }
                }`,
                { input },
            );
            notifySuccess(COUPON_CREATED_TOAST);
            resetCreateForm();
            await loadCoupons();
        } catch (err: any) {
            notifyError(err);
        } finally {
            setWorking(false);
        }
    };

    const handleDeleteCoupon = async (couponId: string) => {
        setWorking(true);
        try {
            await graph(
                `mutation DeleteCoupon($couponId: String!) {
                    deleteCoupon(couponId: $couponId)
                }`,
                { couponId },
            );
            notifySuccess(COUPON_DELETED_TOAST);
            await loadCoupons();
        } catch (err: any) {
            notifyError(err);
        } finally {
            setWorking(false);
        }
    };

    const handleAddPromotionCode = async (couponId: string) => {
        setWorking(true);
        try {
            await graph(
                `mutation CreatePromotionCode($input: PromotionCodeCreateInput!) {
                    createPromotionCode(input: $input) { id code }
                }`,
                { input: { couponId } },
            );
            notifySuccess(PROMO_CODE_CREATED_TOAST);
            await loadCoupons();
        } catch (err: any) {
            notifyError(err);
        } finally {
            setWorking(false);
        }
    };

    const handleDeactivatePromotionCode = async (promotionCodeId: string) => {
        setWorking(true);
        try {
            await graph(
                `mutation DeactivatePromotionCode($promotionCodeId: String!) {
                    deactivatePromotionCode(promotionCodeId: $promotionCodeId) {
                        id
                        active
                    }
                }`,
                { promotionCodeId },
            );
            notifySuccess(PROMO_CODE_DEACTIVATED_TOAST);
            await loadCoupons();
        } catch (err: any) {
            notifyError(err);
        } finally {
            setWorking(false);
        }
    };

    const handleFirstMonthFree = async (event: React.FormEvent) => {
        event.preventDefault();
        const input: Record<string, unknown> = {};
        if (firstMonthFreeCode.trim()) {
            input.code = firstMonthFreeCode.trim();
        }
        setWorking(true);
        try {
            await graph(
                `mutation CreateFirstMonthFreeOffer($input: FirstMonthFreeInput!) {
                    createFirstMonthFreeOffer(input: $input) {
                        coupon { id }
                        promotionCode { id code }
                    }
                }`,
                { input },
            );
            notifySuccess(FIRST_MONTH_FREE_CREATED_TOAST);
            setFirstMonthFreeCode("");
            await loadCoupons();
        } catch (err: any) {
            notifyError(err);
        } finally {
            setWorking(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 pt-8">
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-semibold">
                    {COUPONS_SECTION_HEADER}
                </h2>
                <p className="text-sm text-slate-500">
                    {COUPONS_SECTION_SUBHEADER}
                </p>
            </div>

            <Table aria-label="Coupons">
                <TableHead>
                    <td>{COUPONS_TABLE_HEADER_DISCOUNT}</td>
                    <td>{COUPONS_TABLE_HEADER_DURATION}</td>
                    <td>{COUPONS_TABLE_HEADER_CODES}</td>
                    <td align="right">{COUPONS_TABLE_HEADER_ACTIONS}</td>
                </TableHead>
                <TableBody loading={loading}>
                    {coupons.length === 0 ? (
                        <TableRow>
                            <td className="py-4 text-slate-500" colSpan={4}>
                                {COUPONS_TABLE_EMPTY}
                            </td>
                        </TableRow>
                    ) : (
                        coupons.map((coupon) => (
                            <TableRow key={coupon.id}>
                                <td className="py-2">
                                    <div className="flex flex-col">
                                        <span className="font-medium">
                                            {formatDiscount(coupon)}
                                        </span>
                                        {coupon.name ? (
                                            <span className="text-sm text-slate-500">
                                                {coupon.name}
                                            </span>
                                        ) : null}
                                    </div>
                                </td>
                                <td className="py-2">
                                    {formatDuration(coupon)}
                                </td>
                                <td className="py-2">
                                    <div className="flex flex-col gap-1 items-start">
                                        {coupon.promotionCodes &&
                                        coupon.promotionCodes.length > 0 ? (
                                            coupon.promotionCodes.map((pc) => (
                                                <div
                                                    key={pc.id}
                                                    className="flex items-center gap-2"
                                                >
                                                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">
                                                        {pc.code}
                                                    </code>
                                                    {pc.active ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            disabled={working}
                                                            onClick={() =>
                                                                handleDeactivatePromotionCode(
                                                                    pc.id,
                                                                )
                                                            }
                                                        >
                                                            {
                                                                COUPON_CODE_DEACTIVATE
                                                            }
                                                        </Button>
                                                    ) : (
                                                        <span className="text-xs uppercase text-slate-400">
                                                            {
                                                                COUPON_CODE_INACTIVE_BADGE
                                                            }
                                                        </span>
                                                    )}
                                                </div>
                                            ))
                                        ) : (
                                            <span className="text-sm text-slate-500">
                                                {COUPONS_NO_CODES}
                                            </span>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={working}
                                            onClick={() =>
                                                handleAddPromotionCode(
                                                    coupon.id,
                                                )
                                            }
                                        >
                                            {PROMO_CODE_ADD}
                                        </Button>
                                    </div>
                                </td>
                                <td align="right" className="py-2">
                                    <Menu2 icon={<MoreVert />} variant="soft">
                                        <MenuItem
                                            component="dialog"
                                            title={`${COUPON_DELETE_POPUP_HEADER} "${formatDiscount(coupon)}"`}
                                            triggerChildren={
                                                COUPON_CONTEXT_MENU_DELETE
                                            }
                                            description={
                                                COUPON_DELETE_POPUP_DESC
                                            }
                                            onClick={() =>
                                                handleDeleteCoupon(coupon.id)
                                            }
                                        />
                                    </Menu2>
                                </td>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <form
                onSubmit={handleCreateCoupon}
                className="flex flex-col gap-4 rounded-lg border p-4"
            >
                <h3 className="text-lg font-semibold">
                    {COUPON_CREATE_FORM_HEADER}
                </h3>
                <Select
                    title={COUPON_FIELD_DISCOUNT_TYPE}
                    value={discountType}
                    onChange={(value: string) =>
                        setDiscountType(value as DiscountType)
                    }
                    options={[
                        {
                            label: COUPON_DISCOUNT_TYPE_PERCENT,
                            value: "percent",
                        },
                        { label: COUPON_DISCOUNT_TYPE_AMOUNT, value: "amount" },
                    ]}
                />
                {discountType === "percent" ? (
                    <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                            {COUPON_FIELD_PERCENT_OFF}
                        </span>
                        <Input
                            type="number"
                            min={1}
                            max={100}
                            step="1"
                            value={percentOff}
                            onChange={(e) => setPercentOff(e.target.value)}
                            required
                        />
                    </label>
                ) : (
                    <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                            {COUPON_FIELD_AMOUNT_OFF}
                            {currencyISOCode
                                ? ` (${currencyISOCode.toUpperCase()})`
                                : ""}
                        </span>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={amountOff}
                            onChange={(e) => setAmountOff(e.target.value)}
                            required
                        />
                    </label>
                )}
                <Select
                    title={COUPON_FIELD_DURATION}
                    value={duration}
                    onChange={(value: string) => setDuration(value as Duration)}
                    options={[
                        { label: COUPON_DURATION_ONCE, value: "once" },
                        {
                            label: COUPON_DURATION_REPEATING,
                            value: "repeating",
                        },
                        { label: COUPON_DURATION_FOREVER, value: "forever" },
                    ]}
                />
                {duration === "repeating" ? (
                    <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                            {COUPON_FIELD_DURATION_MONTHS}
                        </span>
                        <Input
                            type="number"
                            min={1}
                            step="1"
                            value={durationInMonths}
                            onChange={(e) =>
                                setDurationInMonths(e.target.value)
                            }
                            required
                        />
                    </label>
                ) : null}
                <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                        {COUPON_FIELD_NAME}
                    </span>
                    <Input
                        value={couponName}
                        onChange={(e) => setCouponName(e.target.value)}
                    />
                </label>
                <div>
                    <Button type="submit" disabled={working}>
                        {COUPON_CREATE_BUTTON}
                    </Button>
                </div>
            </form>

            <form
                onSubmit={handleFirstMonthFree}
                className="flex flex-col gap-4 rounded-lg border p-4"
            >
                <h3 className="text-lg font-semibold">
                    {FIRST_MONTH_FREE_HEADER}
                </h3>
                <p className="text-sm text-slate-500">
                    {FIRST_MONTH_FREE_DESC}
                </p>
                <label className="flex flex-col gap-1">
                    <span className="text-sm font-medium">
                        {PROMO_CODE_FIELD_CODE}
                    </span>
                    <Input
                        value={firstMonthFreeCode}
                        onChange={(e) => setFirstMonthFreeCode(e.target.value)}
                    />
                </label>
                <div>
                    <Button
                        type="submit"
                        variant="secondary"
                        disabled={working}
                    >
                        {FIRST_MONTH_FREE_BUTTON}
                    </Button>
                </div>
            </form>
        </div>
    );
}
