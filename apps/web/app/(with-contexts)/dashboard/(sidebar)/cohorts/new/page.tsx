"use client";

import React, { useState, ChangeEvent, useContext } from "react";
import {
    Button,
    Form,
    FormField,
    Select,
    useToast,
} from "@courselit/components-library";
import {
    APP_MESSAGE_COHORT_CREATED,
    BTN_CONTINUE,
    BUTTON_CANCEL_TEXT,
    COHORT_COURSE_LABEL,
    COHORT_COURSE_PLACEHOLDER,
    COHORT_NAME_LABEL,
    COHORT_NEW_HEADER,
    COHORT_SCHEDULE_END_LABEL,
    COHORT_SCHEDULE_START_LABEL,
    COHORTS_PAGE_HEADING,
    TOAST_TITLE_ERROR,
    TOAST_TITLE_SUCCESS,
} from "@ui-config/strings";
import { FetchBuilder } from "@courselit/utils";
import { FormEvent, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AddressContext, ProfileContext } from "@components/contexts";
import DashboardContent from "@components/admin/dashboard-content";
import { Course, UIConstants } from "@courselit/common-models";
import { checkPermission } from "@courselit/utils";
import LoadingScreen from "@components/admin/loading-screen";

const { permissions } = UIConstants;

const breadcrumbs = [
    {
        label: COHORTS_PAGE_HEADING,
        href: "/dashboard/cohorts",
    },
    {
        label: COHORT_NEW_HEADER,
        href: "#",
    },
];

export default function Page() {
    const address = useContext(AddressContext);
    const [name, setName] = useState("");
    const [courseId, setCourseId] = useState("");
    const [startAt, setStartAt] = useState("");
    const [endAt, setEndAt] = useState("");
    const [courses, setCourses] = useState<
        Pick<Course, "title" | "courseId">[]
    >([]);
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const { toast } = useToast();
    const { profile } = useContext(ProfileContext);

    const loadCourses = useCallback(async () => {
        const query = `
            query { courses: getCoursesAsAdmin(
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
    }, [address.backend]);

    useEffect(() => {
        loadCourses();
    }, [loadCourses]);

    const createCohort = async (e: FormEvent) => {
        e.preventDefault();

        const mutation = `
            mutation CreateCohort(
                $name: String!
                $courseId: String!
                $schedule: CohortScheduleInput
            ) {
                cohort: createCohort(
                    name: $name
                    courseId: $courseId
                    schedule: $schedule
                ) {
                    cohortId
                }
            }
        `;
        const schedule =
            startAt || endAt
                ? {
                      ...(startAt
                          ? { startAt: new Date(startAt).getTime() }
                          : {}),
                      ...(endAt ? { endAt: new Date(endAt).getTime() } : {}),
                  }
                : undefined;
        const fetch = new FetchBuilder()
            .setUrl(`${address.backend}/api/graph`)
            .setPayload({
                query: mutation,
                variables: {
                    name,
                    courseId,
                    schedule,
                },
            })
            .setIsGraphQLEndpoint(true)
            .build();
        try {
            setLoading(true);
            const response = await fetch.exec();
            if (response.cohort) {
                toast({
                    title: TOAST_TITLE_SUCCESS,
                    description: APP_MESSAGE_COHORT_CREATED,
                });
                router.push(`/dashboard/cohorts/${response.cohort.cohortId}`);
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
    };

    if (!profile) {
        return <LoadingScreen />;
    }

    if (
        !checkPermission(profile.permissions ?? [], [permissions.manageUsers])
    ) {
        return <LoadingScreen />;
    }

    return (
        <DashboardContent breadcrumbs={breadcrumbs}>
            <h1 className="text-4xl font-semibold mb-4">{COHORT_NEW_HEADER}</h1>
            <Form onSubmit={createCohort} className="flex flex-col gap-4">
                <FormField
                    required
                    label={COHORT_NAME_LABEL}
                    name="name"
                    value={name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setName(e.target.value)
                    }
                />
                <Select
                    title={COHORT_COURSE_LABEL}
                    value={courseId}
                    onChange={setCourseId}
                    options={courses.map((course) => ({
                        label: course.title,
                        value: course.courseId,
                    }))}
                    placeholderMessage={COHORT_COURSE_PLACEHOLDER}
                />
                <FormField
                    type="datetime-local"
                    label={COHORT_SCHEDULE_START_LABEL}
                    name="startAt"
                    value={startAt}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setStartAt(e.target.value)
                    }
                />
                <FormField
                    type="datetime-local"
                    label={COHORT_SCHEDULE_END_LABEL}
                    name="endAt"
                    value={endAt}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                        setEndAt(e.target.value)
                    }
                />
                <div className="flex gap-2">
                    <Button
                        disabled={!name || !courseId || loading}
                        onClick={createCohort}
                    >
                        {BTN_CONTINUE}
                    </Button>
                    <Button
                        component="link"
                        href="/dashboard/cohorts"
                        variant="soft"
                    >
                        {BUTTON_CANCEL_TEXT}
                    </Button>
                </div>
            </Form>
        </DashboardContent>
    );
}
