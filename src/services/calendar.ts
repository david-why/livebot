import { google } from "googleapis"
import { UserRefreshClient } from "googleapis-common"
import { db } from "../database"
import type { Lesson } from "../models/lesson"

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

export async function syncCalendar() {
  const auth = getClient()
  const calendar = google.calendar({ version: "v3", auth })

  const outdatedLessons = db.getAllCalendarOutdatedLessons()
  for (const lesson of outdatedLessons) {
    const event = convertLessonToEvent(lesson)
    try {
      if (lesson.google_event_id) {
        await calendar.events.update({
          calendarId: CALENDAR_ID,
          eventId: lesson.google_event_id,
          requestBody: event,
        })
        lesson.google_event_outdated = 0
      } else {
        const response = await calendar.events.insert({
          calendarId: CALENDAR_ID,
          requestBody: event,
        })
        lesson.google_event_id = response.data.id || null
        lesson.google_event_outdated = 0
      }
      db.updateLesson(lesson)
    } catch (error) {
      console.error(`Failed to update event for lesson ${lesson.id}:`, error)
    }
  }
}

export async function deleteCalendarEvent(lessonId: number) {
  const auth = getClient()
  const calendar = google.calendar({ version: "v3", auth })

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
      const lesson = db.getLesson(lessonId)!
      lesson.google_event_id = null
      lesson.google_event_outdated = 1
      db.updateLesson(lesson)
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
    .map((instructor) => instructor.name)
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
