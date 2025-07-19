import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js"
import { createCommandGroup } from "../../utils/discordjs"
import Papa from "papaparse"
import { db } from "../../database"

export const { command, execute, events } = createCommandGroup(
  (builder) =>
    builder
      .setName("export")
      .setDescription("Export data from the bot")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  {
    subs: (sub) =>
      sub
        .setHandler(subsCommand)
        .setDescription("Export sub request totals data"),
  },
)

interface InstructorStats {
  subsMade: number
  subsFilled: number
  coursesTaught: number
  subHours: number
  totalHours: number
  avgSubsPerCourse: number
}

async function subsCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply()

  const courses = db.getAllCourses()
  const lessons = db.getAllLessons()
  const instructors = db.getAllInstructors()

  const instructorStats = new Map<number, InstructorStats>()
  for (const instructor of instructors) {
    instructorStats.set(instructor.id, {
      subsMade: 0,
      subsFilled: 0,
      coursesTaught: 0,
      subHours: 0,
      totalHours: 0,
      avgSubsPerCourse: -1,
    })
  }

  for (const course of courses) {
    const instructors = db.getCourseInstructors(course.id)
    for (const instructor of instructors) {
      const stats = instructorStats.get(instructor.id)!
      stats.coursesTaught += 1
    }
  }

  for (const lesson of lessons) {
    const course = courses.find((c) => c.id === lesson.course_id)!
    const subRequests = db.getLessonSubRequests(lesson.id)
    for (const sub of subRequests) {
      instructorStats.get(sub.instructor_id)!.subsMade += 1
      if (sub.filled_by) {
        instructorStats.get(sub.filled_by)!.subsFilled += 1
      }
    }
    const instructors = db.getLessonInstructors(lesson.id)
    for (const instructor of instructors) {
      const stats = instructorStats.get(instructor.id)!
      stats.totalHours += course.duration / 60
      if (instructor.flags & 1) {
        stats.subHours += course.duration / 60
      }
    }
  }

  for (const stats of instructorStats.values()) {
    if (stats.coursesTaught > 0) {
      stats.avgSubsPerCourse = stats.subsMade / stats.coursesTaught
    }
  }

  const csvData = Papa.unparse(
    Array.from(instructorStats.entries()).map(([id, stats]) => ({
      id,
      name: instructors.find((i) => i.id === id)!.name,
      ...stats,
    })),
  )

  await interaction.editReply({
    content: "Here is the exported sub request totals data:",
    files: [
      {
        attachment: Buffer.from(csvData, "utf8"),
        name: "sub_request_totals.csv",
      },
    ],
  })
}
