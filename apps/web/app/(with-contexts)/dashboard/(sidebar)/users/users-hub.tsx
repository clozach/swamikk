"use client";

import DashboardContent from "@components/admin/dashboard-content";
import MemberMimicLink, {
    memberMimicHref,
} from "@components/member-mimic/link";
import { readMemberListReturn } from "@components/member-mimic/list-return";
import LoadingScreen from "@components/admin/loading-screen";
import FilterContainer from "@components/admin/users/filter-container";
import PermissionsMagnet from "@components/admin/users/permissions-magnet";
import permissionToCaptionMap from "@components/admin/users/permissions-to-caption-map";
import { AddressContext, ProfileContext } from "@components/contexts";
import { PaginationControls } from "@components/public/pagination";
import {
    Table,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@components/ui/table";
import {
    User,
    UserFilter,
    UIConstants,
    UserFilterAggregator,
} from "@courselit/common-models";
import { MembershipEntityType } from "@courselit/common-models/dist/constants";
import {
    Avatar,
    AvatarFallback,
    AvatarImage,
    Badge,
    TableBody,
    useToast,
    Skeleton,
} from "@courselit/components-library";
import { checkPermission, FetchBuilder } from "@courselit/utils";
import {
    TOAST_TITLE_ERROR,
    USER_TABLE_HEADER_COMMUNITIES,
    USER_TABLE_HEADER_JOINED,
    USER_TABLE_HEADER_LAST_ACTIVE,
    USER_TABLE_HEADER_NAME,
    USER_TABLE_HEADER_PRODUCTS,
    USER_TABLE_HEADER_STATUS,
    USERS_MANAGER_PAGE_HEADING,
} from "@ui-config/strings";
import { ADMIN_PERMISSIONS } from "@ui-config/constants";
import { permissionsUi } from "@config/strings";
import { formattedLocaleDate } from "@ui-lib/utils";
import {
    KeyboardEvent as ReactKeyboardEvent,
    MouseEvent as ReactMouseEvent,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";

const { permissions } = UIConstants;

const breadcrumbs = [{ label: "Users", href: "#" }];

/** Which account the magnet belongs to, and whether its panel is open. */
type Selection =
    | { kind: "none" }
    | { kind: "row"; userId: string }
    | { kind: "panel"; userId: string };

const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest("input,textarea,select,[contenteditable=true]");
const inDialog = (target: EventTarget | null) =>
    target instanceof HTMLElement && !!target.closest("[role=dialog]");

/** The admin-level captions an account holds, in the editor's order; empty for a plain member. */
export function adminSummary(userPermissions: string[] = []) {
    return Object.keys(permissionToCaptionMap)
        .filter(
            (permission) =>
                ADMIN_PERMISSIONS.includes(permission) &&
                userPermissions.includes(permission),
        )
        .map((permission) => permissionToCaptionMap[permission]);
}

export default function UsersHub() {
    const address = useContext(AddressContext);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [rowsPerPage, _] = useState(10);
    const [users, setUsers] = useState<
        (User & { privatePhotoVersion?: number })[]
    >([]);
    const [filters, setFilters] = useState<UserFilter[]>([]);
    const [filtersAggregator, setFiltersAggregator] =
        useState<UserFilterAggregator>("or");
    const [count, setCount] = useState(0);
    const [returnReady, setReturnReady] = useState(false);
    const [activeUserId, setActiveUserId] = useState<string | null>(null);
    const [selection, setSelection] = useState<Selection>({ kind: "none" });
    const rows = useRef(new Map<string, HTMLTableRowElement>());
    const selectionRef = useRef(selection);
    useEffect(() => {
        selectionRef.current = selection;
    }, [selection]);
    const { toast } = useToast();

    const { profile } = useContext(ProfileContext);

    useEffect(() => {
        const restored = readMemberListReturn(window.location.search);
        setPage(restored.page);
        // An identical filter set keeps its identity, or the list loads twice.
        setFilters((current) =>
            JSON.stringify(current) === JSON.stringify(restored.filter.filters)
                ? current
                : restored.filter.filters,
        );
        setFiltersAggregator(restored.filter.aggregator);
        setReturnReady(true);
    }, []);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        const query = `
                query ($page: Int, $filters: String) {
                    users: getUsers(
                        filters: $filters
                        page: $page
                    ) {
                        name
                        userId
                        email
                        permissions
                        createdAt
                        updatedAt
                        privatePhotoVersion
                        active 
                        content {
                            entityType
                            entity {
                                id
                                title
                            }
                        }
                    },
                    count: getUsersCount(filters: $filters)
                }
            `;

        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query,
                variables: {
                    page,
                    filters: JSON.stringify({
                        aggregator: filtersAggregator,
                        filters,
                    }),
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            const response = await fetch.exec();
            if (response.users) {
                const list: User[] = response.users;
                setUsers(list);
                // A fresh list drops the magnet and hands the keyboard to a row
                // it still holds, else its first.
                setSelection({ kind: "none" });
                setActiveUserId((current) =>
                    list.some((user) => user.userId === current)
                        ? current
                        : (list[0]?.userId ?? null),
                );
            }
            if (typeof response.count !== "undefined") {
                setCount(response.count);
            }
        } catch (err) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [address.backend, page, rowsPerPage, filters, filtersAggregator]);

    useEffect(() => {
        if (
            returnReady &&
            checkPermission(profile?.permissions!, [permissions.manageUsers])
        ) {
            loadUsers();
        }
    }, [loadUsers, returnReady]);

    const onFilterChange = useCallback(
        ({ filters: nextFilters, aggregator, segmentId }) => {
            if (
                JSON.stringify(filters) === JSON.stringify(nextFilters) &&
                filtersAggregator === aggregator
            )
                return;
            setFilters(nextFilters);
            setFiltersAggregator(aggregator);
            setPage(1);
        },
        [filters, filtersAggregator],
    );

    const returnTo = `/dashboard/users?${new URLSearchParams({
        page: String(page),
        filters: JSON.stringify({ filters, aggregator: filtersAggregator }),
    })}`;
    const mimicHrefFor = (user: User) =>
        user.active ? memberMimicHref(user.userId, returnTo) : null;

    const select = (userId: string) => {
        setActiveUserId(userId);
        setSelection((current) =>
            current.kind === "panel" && current.userId === userId
                ? current
                : { kind: "row", userId },
        );
    };
    const focusRow = (userId: string | null) => {
        if (userId) rows.current.get(userId)?.focus();
    };
    const openPanel = useCallback((userId: string) => {
        setActiveUserId(userId);
        setSelection({ kind: "panel", userId });
    }, []);
    const closePanel = useCallback(() => {
        const current = selectionRef.current;
        if (current.kind !== "panel") return;
        setSelection({ kind: "row", userId: current.userId });
        rows.current.get(current.userId)?.focus();
    }, []);

    // ⌥⌘P opens (or closes) the active account's permissions from anywhere on
    // the page; Escape ladders out one level: panel → toolbar → nothing.
    useEffect(() => {
        const keydown = (event: KeyboardEvent) => {
            if (inDialog(event.target)) return;
            if (
                (event.metaKey || event.ctrlKey) &&
                event.altKey &&
                event.code === "KeyP"
            ) {
                const current = selectionRef.current;
                const userId =
                    current.kind === "none" ? activeUserId : current.userId;
                if (!userId) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                if (current.kind === "panel") closePanel();
                else openPanel(userId);
                return;
            }
            // The advanced view's other door in (Al, 2026-09-14): same
            // target, same toggle, as ⌥⌘P — just a bare key, reachable
            // without a chord, for the rare case that needs more than the
            // one Admin checkbox.
            if (
                event.key === "`" &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey &&
                !isTyping(event.target)
            ) {
                const current = selectionRef.current;
                const userId =
                    current.kind === "none" ? activeUserId : current.userId;
                if (!userId) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                if (current.kind === "panel") closePanel();
                else openPanel(userId);
                return;
            }
            if (event.key === "Escape" && !isTyping(event.target)) {
                const current = selectionRef.current;
                if (current.kind === "none") return;
                event.preventDefault();
                event.stopImmediatePropagation();
                if (current.kind === "panel") closePanel();
                else setSelection({ kind: "none" });
            }
        };
        window.addEventListener("keydown", keydown, { capture: true });
        return () =>
            window.removeEventListener("keydown", keydown, { capture: true });
    }, [activeUserId, openPanel, closePanel]);

    // A click anywhere but the magnet or the selected row puts the magnet
    // away. Capture phase: Permissions and Done both swap their own
    // container's children synchronously on click (toolbar <-> panel), so a
    // bubble-phase listener would see the clicked element already detached
    // from the tree by the time it runs, with no ancestors left to find —
    // exactly what made the Permissions button look unresponsive (Al,
    // 2026-09-14). Every other "click outside" listener in this fork
    // already uses capture; this one was the exception.
    useEffect(() => {
        if (selection.kind === "none") return;
        const click = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (
                !target ||
                target.closest("[data-kk-permissions]") ||
                target.closest("tr[data-state=selected]")
            )
                return;
            setSelection({ kind: "none" });
        };
        document.addEventListener("click", click, true);
        return () => document.removeEventListener("click", click, true);
    }, [selection.kind]);

    const onRowKeyDown = (
        event: ReactKeyboardEvent<HTMLTableRowElement>,
        index: number,
        user: User,
    ) => {
        if (event.target !== event.currentTarget) return;
        const step = (next: number) => {
            event.preventDefault();
            focusRow(
                users[Math.max(0, Math.min(users.length - 1, next))]?.userId,
            );
        };
        if (event.key === "ArrowDown") step(index + 1);
        else if (event.key === "ArrowUp") step(index - 1);
        else if (event.key === "Home") step(0);
        else if (event.key === "End") step(users.length - 1);
        else if (
            event.key === "Enter" &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
        ) {
            const href = mimicHrefFor(user);
            if (!href) return;
            event.preventDefault();
            window.location.assign(href);
        }
    };
    const onRowClick = (
        event: ReactMouseEvent<HTMLTableRowElement>,
        user: User,
    ) => {
        // Links and buttons in the row keep their own jobs; ⌘-click belongs to
        // the page's comment layer.
        const target = event.target as HTMLElement;
        if (target.closest("a,button,input") || event.metaKey || event.ctrlKey)
            return;
        select(user.userId);
        event.currentTarget.focus();
    };

    const selectedUser =
        selection.kind === "none"
            ? null
            : users.find((user) => user.userId === selection.userId) || null;

    if (!profile) {
        return <LoadingScreen />;
    }

    return (
        <DashboardContent
            breadcrumbs={breadcrumbs}
            permissions={[permissions.manageUsers]}
        >
            <div className="flex justify-between items-center">
                <h1 className="text-4xl font-semibold mb-4">
                    {USERS_MANAGER_PAGE_HEADING}
                </h1>
            </div>
            <p className="text-sm text-muted-foreground">
                {permissionsUi.hint}
            </p>
            <div className="w-full mt-4 space-y-8">
                <div className="mb-4">
                    {returnReady && (
                        <FilterContainer
                            onChange={onFilterChange}
                            filter={{ filters, aggregator: filtersAggregator }}
                        />
                    )}
                </div>
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="text-muted-foreground font-medium">
                                {USER_TABLE_HEADER_NAME}
                            </TableHead>
                            <TableHead className="text-muted-foreground font-medium">
                                {USER_TABLE_HEADER_STATUS}
                            </TableHead>
                            <TableHead className="text-muted-foreground font-medium">
                                {USER_TABLE_HEADER_PRODUCTS}
                            </TableHead>
                            <TableHead className="text-muted-foreground font-medium">
                                {USER_TABLE_HEADER_COMMUNITIES}
                            </TableHead>
                            <TableHead
                                align="right"
                                className="text-muted-foreground font-medium hidden lg:table-cell"
                            >
                                {USER_TABLE_HEADER_JOINED}
                            </TableHead>
                            <TableHead
                                align="right"
                                className="text-muted-foreground font-medium hidden lg:table-cell"
                            >
                                {USER_TABLE_HEADER_LAST_ACTIVE}
                            </TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading
                            ? Array(5)
                                  .fill(0)
                                  .map((_, index) => (
                                      <TableRow key={index}>
                                          <TableCell>
                                              <div className="flex items-center gap-2">
                                                  <Skeleton className="h-10 w-10 rounded-full" />
                                                  <div className="space-y-1.5">
                                                      <Skeleton className="h-5 w-[200px]" />
                                                      <Skeleton className="h-3.5 w-[150px]" />
                                                  </div>
                                              </div>
                                          </TableCell>
                                          <TableCell>
                                              <Skeleton className="h-6 w-20" />
                                          </TableCell>
                                          <TableCell>
                                              <Skeleton className="h-4 w-8" />
                                          </TableCell>
                                          <TableCell>
                                              <Skeleton className="h-4 w-8" />
                                          </TableCell>
                                          <TableCell className="hidden lg:table-cell">
                                              <Skeleton className="h-4 w-[100px] ml-auto" />
                                          </TableCell>
                                          <TableCell className="hidden lg:table-cell">
                                              <Skeleton className="h-4 w-[100px] ml-auto" />
                                          </TableCell>
                                      </TableRow>
                                  ))
                            : users.map((user, index) => {
                                  const summary = adminSummary(
                                      user.permissions,
                                  );
                                  const selected =
                                      selection.kind !== "none" &&
                                      selection.userId === user.userId;
                                  return (
                                      <TableRow
                                          key={user.email}
                                          ref={(element) => {
                                              if (element)
                                                  rows.current.set(
                                                      user.userId,
                                                      element,
                                                  );
                                              else
                                                  rows.current.delete(
                                                      user.userId,
                                                  );
                                          }}
                                          data-kk-account={user.userId}
                                          data-state={
                                              selected ? "selected" : undefined
                                          }
                                          aria-selected={selected}
                                          aria-label={permissionsUi.rowLabel.replace(
                                              "{name}",
                                              user.name || user.email,
                                          )}
                                          tabIndex={
                                              user.userId === activeUserId
                                                  ? 0
                                                  : -1
                                          }
                                          onFocus={(event) => {
                                              if (
                                                  event.target ===
                                                  event.currentTarget
                                              )
                                                  select(user.userId);
                                          }}
                                          onClick={(event) =>
                                              onRowClick(event, user)
                                          }
                                          onKeyDown={(event) =>
                                              onRowKeyDown(event, index, user)
                                          }
                                      >
                                          <TableCell className="py-2">
                                              <div className="flex items-center gap-2">
                                                  <Avatar>
                                                      <AvatarImage
                                                          src={
                                                              user.privatePhotoVersion
                                                                  ? `/api/contact-preferences/photo?userId=${encodeURIComponent(user.userId)}&v=${user.privatePhotoVersion}`
                                                                  : undefined
                                                          }
                                                          alt={
                                                              user.privatePhotoVersion
                                                                  ? "Private member photo"
                                                                  : ""
                                                          }
                                                      />
                                                      <AvatarFallback>
                                                          {(user.name
                                                              ? user.name.charAt(
                                                                    0,
                                                                )
                                                              : user.email.charAt(
                                                                    0,
                                                                )
                                                          ).toUpperCase()}
                                                      </AvatarFallback>
                                                  </Avatar>
                                                  <div>
                                                      <MemberMimicLink
                                                          userId={
                                                              user.active
                                                                  ? user.userId
                                                                  : null
                                                          }
                                                          returnTo={returnTo}
                                                      >
                                                          <span className="font-medium text-base">
                                                              {user.name
                                                                  ? user.name
                                                                  : user.email}
                                                          </span>
                                                      </MemberMimicLink>
                                                      <div className="text-xs text-muted-foreground">
                                                          {user.email}
                                                      </div>
                                                      {summary.length > 0 && (
                                                          <div
                                                              className="text-xs text-muted-foreground"
                                                              data-kk-permission-summary
                                                          >
                                                              {
                                                                  permissionsUi.summary
                                                              }{" "}
                                                              {summary.join(
                                                                  " · ",
                                                              )}
                                                          </div>
                                                      )}
                                                  </div>
                                              </div>
                                          </TableCell>
                                          <TableCell>
                                              <Badge
                                                  variant={
                                                      user.active
                                                          ? "default"
                                                          : "secondary"
                                                  }
                                              >
                                                  {user.active
                                                      ? "Active"
                                                      : "Restricted"}
                                              </Badge>
                                          </TableCell>
                                          <TableCell>
                                              {
                                                  (user.content ?? []).filter(
                                                      (content) =>
                                                          content.entityType.toLowerCase() ===
                                                          MembershipEntityType.COURSE,
                                                  ).length
                                              }
                                          </TableCell>
                                          <TableCell>
                                              {
                                                  (user.content ?? []).filter(
                                                      (content) =>
                                                          content.entityType.toLowerCase() ===
                                                          MembershipEntityType.COMMUNITY,
                                                  ).length
                                              }
                                          </TableCell>
                                          <TableCell className="hidden lg:table-cell">
                                              {user.createdAt
                                                  ? formattedLocaleDate(
                                                        user.createdAt,
                                                    )
                                                  : ""}
                                          </TableCell>
                                          <TableCell className="hidden lg:table-cell">
                                              {user.updatedAt !== user.createdAt
                                                  ? user.updatedAt
                                                      ? formattedLocaleDate(
                                                            user.updatedAt,
                                                        )
                                                      : ""
                                                  : ""}
                                          </TableCell>
                                      </TableRow>
                                  );
                              })}
                    </TableBody>
                </Table>
                <PaginationControls
                    currentPage={page}
                    totalPages={Math.ceil(count / rowsPerPage)}
                    onPageChange={setPage}
                />
            </div>
            {selectedUser && (
                <PermissionsMagnet
                    key={selectedUser.userId}
                    user={selectedUser}
                    rowElement={rows.current.get(selectedUser.userId) || null}
                    panel={selection.kind === "panel"}
                    address={address}
                    selfUserId={profile.userId}
                    mimicHref={mimicHrefFor(selectedUser)}
                    onOpenPanel={() => openPanel(selectedUser.userId)}
                    onClosePanel={closePanel}
                    onSaved={(next) =>
                        setUsers((current) =>
                            current.map((user) =>
                                user.userId === selectedUser.userId
                                    ? { ...user, permissions: next }
                                    : user,
                            ),
                        )
                    }
                    onOutcomeElsewhere={(message) =>
                        toast({
                            title: permissionsUi.title,
                            description: message,
                        })
                    }
                />
            )}
        </DashboardContent>
    );
}
