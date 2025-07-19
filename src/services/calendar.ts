import { google } from "googleapis"
import { UserRefreshClient } from "googleapis-common"
import { db } from "../database"
import type { Lesson } from "../models/lesson"
import { CourseFlags } from "../models/course"
import { formatInstructor, formatInstructorFlags } from "../utils/format"

interface SyncCalendarOptions {
  callback?: (progress: number) => void
}

const CALENDAR_ID = process.env.CALENDAR_ID || "primary"

export function getClient() {
  const credentials = db.googleCalendarCredentials
  if (!credentials) {
    throw new Error("Google Calendar credentials not found in the database")
  }

  const auth = google.auth.fromJSON(
    JSON.parse(credentials),
  ) as UserRefreshClient

  return auth
}

let isSyncingCalendar = false
let shouldSyncCalendar = false

export async function syncCalendar(options: SyncCalendarOptions = {}) {
  if (isSyncingCalendar) {
    shouldSyncCalendar = true
    return
  }

  isSyncingCalendar = true
  try {
    await syncCalendarInner(options)
  } finally {
    isSyncingCalendar = false
    if (shouldSyncCalendar) {
      shouldSyncCalendar = false
      syncCalendar()
    }
  }
}

async function syncCalendarInner(options: SyncCalendarOptions) {
  const auth = getClient()
  const calendar = google.calendar({ version: "v3", auth, retry: true })

  const outdatedLessons = db.getAllCalendarOutdatedLessons()
  let i = -1
  for (const lesson of outdatedLessons) {
    i++
    const course = db.getCourse(lesson.course_id)!
    if (course.flags & CourseFlags.NoCalendar) {
      console.log(`Skipping lesson ${lesson.id} due to NoCalendar flag`)
      lesson.google_event_outdated = 0
      db.updateLesson(lesson)
      continue
    }
    options.callback?.(i / outdatedLessons.length)
    const event = convertLessonToEvent(lesson)
    try {
      if (lesson.google_event_id) {
        await calendar.events.update({
          calendarId: CALENDAR_ID,
          eventId: lesson.google_event_id,
          requestBody: event,
        })
      } else {
        const response = await calendar.events.insert({
          calendarId: CALENDAR_ID,
          requestBody: event,
        })
        lesson.google_event_id = response.data.id || null
      }
      lesson.google_event_outdated = 0
      db.updateLesson(lesson)
    } catch (error) {
      console.error(`Failed to update event for lesson ${lesson.id}:`, error)
    }
    if (shouldSyncCalendar) {
      return
    }
  }
}

export async function deleteCalendarEvent(lessonId: number) {
  const auth = getClient()
  const calendar = google.calendar({ version: "v3", auth, retry: true })

  const response = await calendar.events.list({
    calendarId: CALENDAR_ID,
    maxResults: 1,
    singleEvents: true,
    sharedExtendedProperty: [`lessonId=${lessonId}`],
  })
  const events = response.data.items || []
  const event = events[0]
  if (event && event.id) {
    try {
      await calendar.events.delete({
        calendarId: CALENDAR_ID,
        eventId: event.id,
      })
      const lesson = db.getLesson(lessonId)
      if (lesson) {
        lesson.google_event_id = null
        lesson.google_event_outdated = 1
        db.updateLesson(lesson)
      }
      console.log(`Deleted event for lesson ${lessonId}: ${event.id}`)
    } catch (error) {
      console.error(`Failed to delete event for lesson ${lessonId}:`, error)
    }
  }
}

function convertLessonToEvent(lesson: Lesson) {
  const course = db.getCourse(lesson.course_id)!
  const instructors = db.getLessonInstructors(lesson.id)

  const endDate = new Date(lesson.date)
  endDate.setMinutes(endDate.getMinutes() + course.duration)

  const instructorString = instructors
    .map(
      (instructor) =>
        `${formatInstructor(instructor, { discord: false })}${formatInstructorFlags(instructor.flags, { compact: true })}`,
    )
    .join(" + ")
  const attendees = instructors.map((instructor) => ({
    email: instructor.email,
  }))

  return {
    summary: `M${course.module} #${course.id} ${instructorString}, ${lesson.abbrev}`,
    description: lesson.description,
    start: {
      dateTime: lesson.date.toISOString(),
    },
    end: {
      dateTime: endDate.toISOString(),
    },
    extendedProperties: {
      shared: {
        courseId: `${course.id}`,
        lessonId: `${lesson.id}`,
        module: `${course.module}`,
        instructors: instructorString,
      },
    },
    attendees,
  }
}
