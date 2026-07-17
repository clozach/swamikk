"use client";

import DashboardContent from "@components/admin/dashboard-content";
import AdminEmptyState from "@components/admin/empty-state";
import { AddressContext, ProfileContext } from "@components/contexts";
import { Course, UIConstants } from "@courselit/common-models";
import {
    Badge,
    Select,
    TableBody,
    useToast,
} from "@courselit/components-library";
import { FetchBuilder } from "@courselit/utils";
import {
    APP_MESSAGE_COHORT_DELETED,
    APP_MESSAGE_COHORT_MEMBER_ADDED,
    APP_MESSAGE_COHORT_MEMBER_REMOVED,
    APP_MESSAGE_COHORT_SYNCED,
    APP_MESSAGE_COHORT_UPDATED,
    BTN_ADD_COHORT_MEMBER,
    BTN_DELETE_COHORT,
    BTN_MESSAGE_COHORT,
    BTN_REMOVE_COHORT_MEMBER,
    BTN_SYNC_FROM_COURSE,
    BUTTON_CANCEL_TEXT,
    COHORT_ADD_MEMBER_PLACEHOLDER,
    COHORT_COURSE_LABEL,
    COHORT_DELETE_DIALOG_DESCRIPTION,
    COHORT_DELETE_DIALOG_TITLE,
    COHORT_DETAILS_HEADER,
    COHORT_MEMBER_UNSUBSCRIBED_BADGE,
    COHORT_MEMBERS_EMPTY_DESCRIPTION,
    COHORT_MEMBERS_EMPTY_TITLE,
    COHORT_MEMBERS_HEADER,
    COHORT_NAME_LABEL,
    COHORT_SCHEDULE_END_LABEL,
    COHORT_SCHEDULE_START_LABEL,
    COHORT_TABLE_HEADER_NAME,
    COHORTS_PAGE_HEADING,
    DANGER_ZONE_HEADER,
    PAGE_HEADER_EDIT_COHORT,
    POPUP_OK_ACTION,
    PRODUCTS_TABLE_HEADER_ACTIONS,
    TOAST_TITLE_ERROR,
    TOAST_TITLE_SUCCESS,
    USER_DETAILS_SAVE_BUTTON,
    USER_DETAILS_SAVE_BUTTON_LOADING,
    USER_TABLE_HEADER_STATUS,
} from "@ui-config/strings";
import type Cohort from "@ui-models/cohort";
import {
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    use,
} from "react";
import type { FormEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@components/ui/card";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldSet } from "@components/ui/field";
import {
    Table,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@components/ui/table";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@components/ui/alert-dialog";
import { Loader2, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

const COHORT_TAG_PREFIX = "cohort:";
const BLANK_SYSTEM_TEMPLATE_ID = "system-5";
const ENROLLED_USERS_LIMIT = 100;

interface CohortMember {
    userId: string;
    name?: string;
    email: string;
    subscribedToUpdates?: boolean;
}

const breadcrumbs = [
    { label: COHORTS_PAGE_HEADING, href: "/dashboard/cohorts" },
    { label: PAGE_HEADER_EDIT_COHORT, href: "#" },
];

const toDatetimeLocal = (epoch?: number | null) =>
    epoch
        ? new Date(epoch - new Date().getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16)
        : "";

const cohortFields = `
    cohortId
    name
    courseId
    members
    schedule {
        startAt
        endAt
    }
    createdAt
`;

export default function Page(props: { params: Promise<{ id: string }> }) {
    const params = use(props.params);
    const [cohort, setCohort] = useState<Cohort>();
    const [members, setMembers] = useState<CohortMember[]>([]);
    const [courses, setCourses] = useState<
        Pick<Course, "title" | "courseId">[]
    >([]);
    const [enrolled, setEnrolled] = useState<CohortMember[]>([]);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [details, setDetails] = useState({
        name: "",
        startAt: "",
        endAt: "",
    });
    const initialDetailsRef = useRef({ name: "", startAt: "", endAt: "" });
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isAddingMember, setIsAddingMember] = useState(false);
    const [isMessaging, setIsMessaging] = useState(false);
    const address = useContext(AddressContext);
    const { id } = params;
    const { toast } = useToast();
    const { profile } = useContext(ProfileContext);
    const router = useRouter();
    const { permissions } = UIConstants;

    const loadCohort = useCallback(async () => {
        const query = `
            query ($cohortId: String!) {
                cohort: getCohort(cohortId: $cohortId) {
                    ${cohortFields}
                },
                members: getCohortMembers(cohortId: $cohortId) {
                    userId,
                    name,
                    email,
                    subscribedToUpdates
                },
                courses: getCoursesAsAdmin(
                    offset: 1
                ) {
                    title,
                    courseId,
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query,
                variables: {
                    cohortId: id,
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            const response = await fetch.exec();
            if (response.cohort) {
                setCohort(response.cohort);
            }
            if (response.members) {
                setMembers(response.members);
            }
            if (response.courses) {
                setCourses(response.courses);
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        }
    }, [address.backend, id]);

    useEffect(() => {
        loadCohort();
    }, [loadCohort]);

    useEffect(() => {
        if (cohort) {
            const detailsFromCohort = {
                name: cohort.name,
                startAt: toDatetimeLocal(cohort.schedule?.startAt),
                endAt: toDatetimeLocal(cohort.schedule?.endAt),
            };
            setDetails(detailsFromCohort);
            initialDetailsRef.current = { ...detailsFromCohort };
        }
    }, [cohort]);

    const loadEnrolled = useCallback(
        async (courseId: string) => {
            const query = `
                query ($filters: String, $limit: Int) {
                    users: getUsers(filters: $filters, limit: $limit) {
                        userId,
                        name,
                        email
                    }
                }
            `;
            const fetch = new FetchBuilder()
                .setUrl(`${address.backend}/api/graph`)
                .setPayload({
                    query,
                    variables: {
                        filters: JSON.stringify({
                            aggregator: "or",
                            filters: [
                                {
                                    name: "product",
                                    condition: "Has",
                                    value: courseId,
                                },
                            ],
                        }),
                        limit: ENROLLED_USERS_LIMIT,
                    },
                })
                .setIsGraphQLEndpoint(true)
                .build();
            try {
                const response = await fetch.exec();
                if (response.users) {
                    setEnrolled(response.users);
                }
            } catch (err: any) {
                toast({
                    title: TOAST_TITLE_ERROR,
                    description: err.message,
                    variant: "destructive",
                });
            }
        },
        [address.backend],
    );

    useEffect(() => {
        if (cohort?.courseId) {
            loadEnrolled(cohort.courseId);
        }
    }, [cohort?.courseId, loadEnrolled]);

    const refreshRoster = useCallback(async () => {
        const query = `
            query ($cohortId: String!) {
                cohort: getCohort(cohortId: $cohortId) {
                    ${cohortFields}
                },
                members: getCohortMembers(cohortId: $cohortId) {
                    userId,
                    name,
                    email,
                    subscribedToUpdates
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query,
                variables: {
                    cohortId: id,
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        const response = await fetch.exec();
        if (response.cohort) {
            setCohort(response.cohort);
        }
        if (response.members) {
            setMembers(response.members);
        }
    }, [address.backend, id]);

    const handleDetailsSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!cohort) {
            return;
        }

        const trimmedName = details.name.trim();
        const mutation = `
            mutation UpdateCohort(
                $cohortId: String!
                $name: String
                $schedule: CohortScheduleInput
            ) {
                cohort: updateCohort(
                    cohortId: $cohortId
                    name: $name
                    schedule: $schedule
                ) {
                    ${cohortFields}
                }
            }
        `;
        const schedule =
            details.startAt || details.endAt
                ? {
                      ...(details.startAt
                          ? { startAt: new Date(details.startAt).getTime() }
                          : {}),
                      ...(details.endAt
                          ? { endAt: new Date(details.endAt).getTime() }
                          : {}),
                  }
                : null;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: mutation,
                variables: {
                    cohortId: cohort.cohortId,
                    name:
                        trimmedName && trimmedName !== cohort.name
                            ? trimmedName
                            : undefined,
                    schedule,
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            setIsSavingDetails(true);
            const response = await fetch.exec();
            if (response.cohort) {
                setCohort(response.cohort);
                toast({
                    title: TOAST_TITLE_SUCCESS,
                    description: APP_MESSAGE_COHORT_UPDATED,
                });
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setIsSavingDetails(false);
        }
    };

    const handleDeleteCohort = async () => {
        if (!cohort) {
            return;
        }
        const mutation = `
            mutation DeleteCohort($cohortId: String!) {
                cohort: deleteCohort(cohortId: $cohortId) {
                    cohortId
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: mutation,
                variables: {
                    cohortId: cohort.cohortId,
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            setIsDeleting(true);
            const response = await fetch.exec();
            if (response.cohort) {
                toast({
                    title: TOAST_TITLE_SUCCESS,
                    description: APP_MESSAGE_COHORT_DELETED,
                });
                router.push("/dashboard/cohorts");
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleSyncFromCourse = async () => {
        if (!cohort) {
            return;
        }
        const mutation = `
            mutation SyncCohortFromCourse($cohortId: String!) {
                cohort: syncCohortFromCourse(cohortId: $cohortId) {
                    cohortId
                    members
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: mutation,
                variables: {
                    cohortId: cohort.cohortId,
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            setIsSyncing(true);
            const response = await fetch.exec();
            if (response.cohort) {
                await refreshRoster();
                toast({
                    title: TOAST_TITLE_SUCCESS,
                    description: `${APP_MESSAGE_COHORT_SYNCED} ${response.cohort.members.length}`,
                });
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleAddMember = async () => {
        if (!cohort || !selectedUserId) {
            return;
        }
        const mutation = `
            mutation AddCohortMembers(
                $cohortId: String!
                $userIds: [String]!
            ) {
                cohort: addCohortMembers(
                    cohortId: $cohortId
                    userIds: $userIds
                ) {
                    cohortId
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: mutation,
                variables: {
                    cohortId: cohort.cohortId,
                    userIds: [selectedUserId],
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            setIsAddingMember(true);
            const response = await fetch.exec();
            if (response.cohort) {
                setSelectedUserId("");
                await refreshRoster();
                toast({
                    title: TOAST_TITLE_SUCCESS,
                    description: APP_MESSAGE_COHORT_MEMBER_ADDED,
                });
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setIsAddingMember(false);
        }
    };

    const handleRemoveMember = async (userId: string) => {
        if (!cohort) {
            return;
        }
        const mutation = `
            mutation RemoveCohortMembers(
                $cohortId: String!
                $userIds: [String]!
            ) {
                cohort: removeCohortMembers(
                    cohortId: $cohortId
                    userIds: $userIds
                ) {
                    cohortId
                }
            }
        `;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: mutation,
                variables: {
                    cohortId: cohort.cohortId,
                    userIds: [userId],
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            const response = await fetch.exec();
            if (response.cohort) {
                await refreshRoster();
                toast({
                    title: TOAST_TITLE_SUCCESS,
                    description: APP_MESSAGE_COHORT_MEMBER_REMOVED,
                });
            }
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        }
    };

    const handleMessageCohort = async () => {
        if (!cohort) {
            return;
        }
        const createMutation = `
            mutation CreateSequence(
                $type: SequenceType!
                $templateId: String!
            ) {
                sequence: createSequence(
                    type: $type
                    templateId: $templateId
                ) {
                    sequenceId
                }
            }
        `;
        try {
            setIsMessaging(true);
            const createFetch = new FetchBuilder()
                .setUrl(`${address.backend}/api/graph`)
                .setPayload({
                    query: createMutation,
                    variables: {
                        type: "BROADCAST",
                        templateId: BLANK_SYSTEM_TEMPLATE_ID,
                    },
                })
                .setIsGraphQLEndpoint(true)
                .build();
            const createResponse = await createFetch.exec();
            const sequenceId = createResponse.sequence?.sequenceId;
            if (!sequenceId) {
                return;
            }
            const filterMutation = `
                mutation UpdateEmail($sequenceId: String!, $filter: String) {
                    sequence: updateEmail(
                        sequenceId: $sequenceId
                        filter: $filter
                    ) {
                        sequenceId
                    }
                }
            `;
            const filterFetch = new FetchBuilder()
                .setUrl(`${address.backend}/api/graph`)
                .setPayload({
                    query: filterMutation,
                    variables: {
                        sequenceId,
                        filter: JSON.stringify({
                            aggregator: "or",
                            filters: [
                                {
                                    name: "tag",
                                    condition: "Has",
                                    value: `${COHORT_TAG_PREFIX}${cohort.cohortId}`,
                                    valueLabel: cohort.name,
                                },
                            ],
                        }),
                    },
                })
                .setIsGraphQLEndpoint(true)
                .build();
            await filterFetch.exec();
            router.push(`/dashboard/mails/broadcast/${sequenceId}`);
        } catch (err: any) {
            toast({
                title: TOAST_TITLE_ERROR,
                description: err.message,
                variant: "destructive",
            });
        } finally {
            setIsMessaging(false);
        }
    };

    if (!cohort) {
        return null;
    }

    const courseTitle =
        courses.find((course) => course.courseId === cohort.courseId)?.title ||
        cohort.courseId;
    const candidates = enrolled.filter(
        (user) => !cohort.members.includes(user.userId),
    );
    const hasDetailsChanged =
        details.name.trim() !== initialDetailsRef.current.name ||
        details.startAt !== initialDetailsRef.current.startAt ||
        details.endAt !== initialDetailsRef.current.endAt;
    const isSaveButtonDisabled =
        isSavingDetails || !details.name.trim() || !hasDetailsChanged;

    return (
        <DashboardContent
            breadcrumbs={breadcrumbs}
            permissions={[permissions.manageUsers]}
        >
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-4xl font-semibold">{cohort.name}</h1>
                <Button onClick={handleMessageCohort} disabled={isMessaging}>
                    {isMessaging ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Send className="mr-2 h-4 w-4" />
                    )}
                    {BTN_MESSAGE_COHORT}
                </Button>
            </div>
            <div className="flex flex-col gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle>{COHORT_DETAILS_HEADER}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <form
                            onSubmit={handleDetailsSubmit}
                            className="space-y-4"
                        >
                            <FieldSet>
                                <FieldGroup>
                                    <Field>
                                        <FieldLabel htmlFor="cohort-name">
                                            {COHORT_NAME_LABEL}
                                        </FieldLabel>
                                        <Input
                                            id="cohort-name"
                                            value={details.name}
                                            onChange={(event) =>
                                                setDetails((prev) => ({
                                                    ...prev,
                                                    name: event.target.value,
                                                }))
                                            }
                                        />
                                    </Field>
                                    <Field>
                                        <FieldLabel htmlFor="cohort-course">
                                            {COHORT_COURSE_LABEL}
                                        </FieldLabel>
                                        <Input
                                            id="cohort-course"
                                            value={courseTitle}
                                            disabled
                                            readOnly
                                        />
                                    </Field>
                                    <Field>
                                        <FieldLabel htmlFor="cohort-start-at">
                                            {COHORT_SCHEDULE_START_LABEL}
                                        </FieldLabel>
                                        <Input
                                            id="cohort-start-at"
                                            type="datetime-local"
                                            value={details.startAt}
                                            onChange={(event) =>
                                                setDetails((prev) => ({
                                                    ...prev,
                                                    startAt: event.target.value,
                                                }))
                                            }
                                        />
                                    </Field>
                                    <Field>
                                        <FieldLabel htmlFor="cohort-end-at">
                                            {COHORT_SCHEDULE_END_LABEL}
                                        </FieldLabel>
                                        <Input
                                            id="cohort-end-at"
                                            type="datetime-local"
                                            value={details.endAt}
                                            onChange={(event) =>
                                                setDetails((prev) => ({
                                                    ...prev,
                                                    endAt: event.target.value,
                                                }))
                                            }
                                        />
                                    </Field>
                                </FieldGroup>
                            </FieldSet>
                            <div className="flex justify-end">
                                <Button
                                    type="submit"
                                    disabled={isSaveButtonDisabled}
                                >
                                    {isSavingDetails
                                        ? USER_DETAILS_SAVE_BUTTON_LOADING
                                        : USER_DETAILS_SAVE_BUTTON}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>
                            {COHORT_MEMBERS_HEADER} ({members.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-2 md:items-center">
                            <div className="md:w-72">
                                <Select
                                    title=""
                                    variant="without-label"
                                    value={selectedUserId}
                                    onChange={setSelectedUserId}
                                    options={candidates.map((user) => ({
                                        label: user.name || user.email,
                                        value: user.userId,
                                        sublabel: user.name
                                            ? user.email
                                            : undefined,
                                    }))}
                                    placeholderMessage={
                                        COHORT_ADD_MEMBER_PLACEHOLDER
                                    }
                                    disabled={candidates.length === 0}
                                />
                            </div>
                            <Button
                                onClick={handleAddMember}
                                disabled={!selectedUserId || isAddingMember}
                            >
                                {isAddingMember ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                {BTN_ADD_COHORT_MEMBER}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleSyncFromCourse}
                                disabled={isSyncing}
                            >
                                {isSyncing ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                {BTN_SYNC_FROM_COURSE}
                            </Button>
                        </div>
                        {members.length === 0 ? (
                            <AdminEmptyState
                                title={COHORT_MEMBERS_EMPTY_TITLE}
                                description={COHORT_MEMBERS_EMPTY_DESCRIPTION}
                            />
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="text-muted-foreground font-medium">
                                            {COHORT_TABLE_HEADER_NAME}
                                        </TableHead>
                                        <TableHead className="text-muted-foreground font-medium">
                                            {USER_TABLE_HEADER_STATUS}
                                        </TableHead>
                                        <TableHead
                                            align="right"
                                            className="text-muted-foreground font-medium"
                                        >
                                            {PRODUCTS_TABLE_HEADER_ACTIONS}
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {members.map((member) => (
                                        <TableRow key={member.userId}>
                                            <TableCell className="py-2">
                                                <div className="font-medium text-base">
                                                    {member.name ||
                                                        member.email}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {member.email}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {member.subscribedToUpdates ===
                                                    false && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-muted-foreground"
                                                    >
                                                        {
                                                            COHORT_MEMBER_UNSUBSCRIBED_BADGE
                                                        }
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        handleRemoveMember(
                                                            member.userId,
                                                        )
                                                    }
                                                >
                                                    {BTN_REMOVE_COHORT_MEMBER}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle className="text-destructive">
                            {DANGER_ZONE_HEADER}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    disabled={isDeleting}
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    {BTN_DELETE_COHORT}
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>
                                        {COHORT_DELETE_DIALOG_TITLE}
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {COHORT_DELETE_DIALOG_DESCRIPTION}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>
                                        {BUTTON_CANCEL_TEXT}
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDeleteCohort}
                                        disabled={isDeleting}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isDeleting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                {BTN_DELETE_COHORT}
                                            </>
                                        ) : (
                                            POPUP_OK_ACTION
                                        )}
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </CardContent>
                </Card>
            </div>
        </DashboardContent>
    );
}
