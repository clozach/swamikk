"use client";

import DashboardContent from "@components/admin/dashboard-content";
import AdminEmptyState from "@components/admin/empty-state";
import LoadingScreen from "@components/admin/loading-screen";
import { AddressContext, ProfileContext } from "@components/contexts";
import {
    Table,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@components/ui/table";
import { Button } from "@components/ui/button";
import { Course, UIConstants } from "@courselit/common-models";
import {
    Link,
    TableBody,
    useToast,
    Skeleton,
} from "@courselit/components-library";
import { checkPermission, FetchBuilder } from "@courselit/utils";
import {
    BTN_NEW_COHORT,
    COHORT_SCHEDULE_EMPTY,
    COHORT_TABLE_HEADER_COURSE,
    COHORT_TABLE_HEADER_MEMBERS,
    COHORT_TABLE_HEADER_NAME,
    COHORT_TABLE_HEADER_SCHEDULE,
    COHORTS_LIST_EMPTY_DESCRIPTION,
    COHORTS_LIST_EMPTY_TITLE,
    COHORTS_PAGE_HEADING,
    TOAST_TITLE_ERROR,
} from "@ui-config/strings";
import { formattedLocaleDate } from "@ui-lib/utils";
import type Cohort from "@ui-models/cohort";
import type { CohortSchedule } from "@ui-models/cohort";
import NextLink from "next/link";
import { useCallback, useContext, useEffect, useState } from "react";

const { permissions } = UIConstants;

const breadcrumbs = [{ label: COHORTS_PAGE_HEADING, href: "#" }];

const formatSchedule = (schedule?: CohortSchedule | null) => {
    const startAt = schedule?.startAt
        ? formattedLocaleDate(schedule.startAt)
        : "";
    const endAt = schedule?.endAt ? formattedLocaleDate(schedule.endAt) : "";
    if (!startAt && !endAt) {
        return COHORT_SCHEDULE_EMPTY;
    }
    return [startAt, endAt].filter(Boolean).join(" – ");
};

export default function CohortsHub() {
    const address = useContext(AddressContext);
    const [loading, setLoading] = useState(true);
    const [cohorts, setCohorts] = useState<Cohort[]>([]);
    const [courses, setCourses] = useState<
        Pick<Course, "title" | "courseId">[]
    >([]);
    const { toast } = useToast();

    const { profile } = useContext(ProfileContext);

    const loadCohorts = useCallback(async () => {
        setLoading(true);
        const query = `
            query {
                cohorts: getCohorts {
                    cohortId
                    name
                    courseId
                    members
                    schedule {
                        startAt
                        endAt
                    }
                    createdAt
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
            .setPayload(query)
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            const response = await fetch.exec();
            if (response.cohorts) {
                setCohorts(response.cohorts);
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
        } finally {
            setLoading(false);
        }
    }, [address.backend]);

    useEffect(() => {
        if (checkPermission(profile?.permissions!, [permissions.manageUsers])) {
            loadCohorts();
        }
    }, [loadCohorts, profile?.permissions]);

    const courseTitle = (courseId: string) =>
        courses.find((course) => course.courseId === courseId)?.title ||
        courseId;

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
                    {COHORTS_PAGE_HEADING}
                </h1>
                <div>
                    <NextLink href="/dashboard/cohorts/new">
                        <Button>{BTN_NEW_COHORT}</Button>
                    </NextLink>
                </div>
            </div>
            <div className="w-full mt-4 space-y-8">
                {!loading && cohorts.length === 0 ? (
                    <AdminEmptyState
                        title={COHORTS_LIST_EMPTY_TITLE}
                        description={COHORTS_LIST_EMPTY_DESCRIPTION}
                        actionLabel={BTN_NEW_COHORT}
                        actionHref="/dashboard/cohorts/new"
                    />
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="text-muted-foreground font-medium">
                                    {COHORT_TABLE_HEADER_NAME}
                                </TableHead>
                                <TableHead className="text-muted-foreground font-medium">
                                    {COHORT_TABLE_HEADER_COURSE}
                                </TableHead>
                                <TableHead className="text-muted-foreground font-medium">
                                    {COHORT_TABLE_HEADER_MEMBERS}
                                </TableHead>
                                <TableHead className="text-muted-foreground font-medium">
                                    {COHORT_TABLE_HEADER_SCHEDULE}
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
                                                  <Skeleton className="h-5 w-[200px]" />
                                              </TableCell>
                                              <TableCell>
                                                  <Skeleton className="h-5 w-[150px]" />
                                              </TableCell>
                                              <TableCell>
                                                  <Skeleton className="h-4 w-8" />
                                              </TableCell>
                                              <TableCell>
                                                  <Skeleton className="h-4 w-[180px]" />
                                              </TableCell>
                                          </TableRow>
                                      ))
                                : cohorts.map((cohort) => (
                                      <TableRow key={cohort.cohortId}>
                                          <TableCell className="py-2">
                                              <Link
                                                  href={`/dashboard/cohorts/${cohort.cohortId}`}
                                              >
                                                  <span className="font-medium text-base">
                                                      {cohort.name}
                                                  </span>
                                              </Link>
                                          </TableCell>
                                          <TableCell>
                                              {courseTitle(cohort.courseId)}
                                          </TableCell>
                                          <TableCell>
                                              {cohort.members.length}
                                          </TableCell>
                                          <TableCell>
                                              {formatSchedule(cohort.schedule)}
                                          </TableCell>
                                      </TableRow>
                                  ))}
                        </TableBody>
                    </Table>
                )}
            </div>
        </DashboardContent>
    );
}
