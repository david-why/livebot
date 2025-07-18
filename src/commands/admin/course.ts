import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  PermissionFlagsBits,
} from "discord.js"
import type { DateTime } from "luxon"
import { lessonAbbreviations, lessonNames, modules } from "../../consts"
import { db } from "../../database"
import { parseDatesString } from "../../utils/dates"
import { createCommandGroup } from "../../utils/discordjs"
import { formatInstructorFlags, formatTimestamp } from "../../utils/format"
import { deleteCalendarEvent } from "../../services/calendar"

export const { command, execute, events } = createCommandGroup(
  (builder) =>
    builder
      .setName("course")
      .setDescription("[ADMIN] Manage and view courses")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  {
    info: (sub) =>
      sub
        .setHandler(infoCommand)
        .setDescription("[ADMIN] Get information about a course")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("The ID of the course")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    add: (sub) =>
      sub
        .setHandler(addCommand)
        .setDescription("[ADMIN] Add a new course")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID of the course")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("module")
            .setDescription("Module number of the course")
            .setRequired(true)
            .setChoices(modules),
        )
        .addStringOption((option) =>
          option
            .setName("time")
            .setDescription(
              "The start time of the course in the given timezone, in the format HH:MM",
            )
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("dates")
            .setDescription(
              "The dates of the course in the weird template format",
            )
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("duration")
            .setDescription("Duration of the course in minutes")
            .setRequired(true),
        )
        .addUserOption((option) =>
          option
            .setName("instructor1")
            .setDescription("First instructor for the course"),
        )
        .addUserOption((option) =>
          option
            .setName("instructor2")
            .setDescription("Second instructor for the course"),
        )
        .addStringOption((option) =>
          option
            .setName("timezone")
            .setDescription(
              "Timezone for the course dates (default is 'America/New_York', e.g. 'Asia/Shanghai')",
            ),
        ),
    "add-instructor": (sub) =>
      sub
        .setHandler(addInstructorCommand)
        .setDescription("[ADMIN] Add an instructor to a course")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("The course to add the instructor to")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName("instructor")
            .setDescription("The instructor to add to the course")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("lessons")
            .setDescription(
              "Whether to add the instructor to all lessons of the course",
            ),
        ),
    "remove-instructor": (sub) =>
      sub
        .setHandler(removeInstructorCommand)
        .setDescription("[ADMIN] Remove an instructor from a course")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("The course to remove the instructor from")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName("instructor")
            .setDescription("The instructor to remove from the course")
            .setRequired(true),
        ),
    edit: (sub) =>
      sub
        .setHandler(editCommand)
        .setDescription("[ADMIN] Edit an existing course")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID of the course to edit")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("module")
            .setDescription("Module number of the course")
            .setRequired(false)
            .setChoices(modules),
        ),
    remove: (sub) =>
      sub
        .setHandler(removeCommand)
        .setName("remove")
        .setDescription("[ADMIN] Remove an existing course")
        .addIntegerOption((option) =>
          option
            .setName("id")
            .setDescription("ID of the course to remove")
            .setRequired(true)
            .setAutocomplete(true),
        ),
  },
  {
    autocomplete: {
      info: {
        id: autocompleteCourseId,
      },
      "add-instructor": {
        id: autocompleteCourseId,
      },
      edit: {
        id: autocompleteCourseId,
      },
      remove: {
        id: autocompleteCourseId,
      },
    },
  },
)

async function infoCommand(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getInteger("id", true)
  const course = db.getCourse(id)
  if (!course) {
    return interaction.reply({
      content: `Course with ID ${id} not found.`,
      flags: "Ephemeral",
    })
  }
  const instructors = db.getCourseInstructors(id)
  const lessons = db.getCourseLessons(id)
  const scheduledDates = lessons
    .map((lesson) => {
      const instructors = db.getLessonInstructors(lesson.id)
      const instructorMentions = instructors
        .map((i) => `<@${i.discord_id}>${formatInstructorFlags(i.flags)}`)
        .join(" & ")
      return `- ${lesson.name}, ${formatTimestamp(lesson.date)}, ${instructorMentions}`
    })
    .join("\n")
  const content =
    `Course LIVE #${id} (Module ${course.module})\n` +
    `Instructors: ${instructors.map((i) => `<@${i.discord_id}>`).join(", ")}\n` +
    `Scheduled dates:\n${scheduledDates}`
  await interaction.reply({
    embeds: [
      new EmbedBuilder().setTitle(`Course Info`).setDescription(content),
    ],
    allowedMentions: { users: [] },
  })
}

async function addCommand(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getInteger("id", true)
  const module = interaction.options.getInteger("module", true)
  const time = interaction.options.getString("time", true)
  const datesString = interaction.options.getString("dates", true)
  const duration = interaction.options.getInteger("duration", true)
  const timezone =
    interaction.options.getString("timezone") ?? "America/New_York"
  const instructor1User = interaction.options.getUser("instructor1")
  const instructor2User = interaction.options.getUser("instructor2")

  // Check if course already exists
  const existingCourse = db.getCourse(id)
  if (existingCourse) {
    return interaction.reply({
      content: `Course with ID ${id} already exists.`,
      flags: "Ephemeral",
    })
  }

  const instructorUsers = [instructor1User, instructor2User].filter((x) => !!x)
  const instructorIds: number[] = []
  for (const user of instructorUsers) {
    // Check if instructor already exists
    const instructor = db.getInstructorByDiscordId(user.id)
    if (!instructor) {
      return interaction.reply({
        content: `Instructor <@${user.id}> is not registered. Please register them first using the \`/instructor add\` command.`,
        flags: "Ephemeral",
      })
    }
    instructorIds.push(instructor.id)
  }

  // Process date input
  const datesMidnight: DateTime[] = []
  try {
    datesMidnight.push(...parseDatesString(datesString))
  } catch (error) {
    return interaction.reply({
      content: `Error parsing dates: ${(error as Error)?.message ?? "Unknown error"}`,
      flags: "Ephemeral",
    })
  }

  // datesMidnight is UTC midnight of the given dates, make them the right time
  const dates: DateTime[] = []
  for (const date of datesMidnight) {
    const [hours, minutes] = time.split(":").map(Number)
    const newDate = date.setZone(timezone, { keepLocalTime: true }).set({
      hour: hours,
      minute: minutes,
      second: 0,
      millisecond: 0,
    })
    dates.push(newDate)
  }

  const courseLessonNames =
    dates.length === lessonNames.length
      ? lessonNames
      : dates.map((_, i) => `Lesson ${i + 1}`)
  const courseLessonAbbreviations =
    dates.length === lessonAbbreviations.length
      ? lessonAbbreviations
      : dates.map((_, i) => `L${i + 1}`)

  db.addCourse(id, module, duration)
  db.addCourseInstructors(id, instructorIds)
  for (let i = 0; i < dates.length; i++) {
    db.addCourseLesson(
      id,
      dates[i]!.toJSDate(),
      courseLessonNames[i]!,
      courseLessonAbbreviations[i]!,
    )
  }

  await interaction.reply({
    content: `Course LIVE #${id} M${module} created successfully with ${dates.length} date(s).`,
  })
  return
}

async function addInstructorCommand(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getInteger("id", true)
  const instructorUser = interaction.options.getUser("instructor", true)
  const addToAllLessons = interaction.options.getBoolean("lessons") ?? false

  // Check if course exists
  const course = db.getCourse(id)
  if (!course) {
    return interaction.reply({
      content: `Course #${id} not found.`,
      flags: "Ephemeral",
    })
  }

  // Check if instructor already exists
  const instructor = db.getInstructorByDiscordId(instructorUser.id)
  if (!instructor) {
    return interaction.reply({
      content: `Instructor <@${instructorUser.id}> is not registered. Please register them first using the \`/instructor add\` command.`,
      flags: "Ephemeral",
      allowedMentions: { users: [] },
    })
  }

  // Check if instructor is already added to the course
  const existingInstructors = db.getCourseInstructors(id)
  if (existingInstructors.some((i) => i.id === instructor.id)) {
    return interaction.reply({
      content: `Instructor <@${instructorUser.id}> is already added to course #${id}.`,
      flags: "Ephemeral",
      allowedMentions: { users: [] },
    })
  }

  db.addCourseInstructors(id, [instructor.id])

  if (addToAllLessons) {
    const lessons = db.getCourseLessons(id)
    for (const lesson of lessons) {
      db.addLessonInstructor(lesson.id, instructor.id)
      lesson.google_event_outdated = 1
      db.updateLesson(lesson)
    }
    await interaction.reply({
      content: `Instructor <@${instructorUser.id}> has been added to all lessons of course #${id} successfully.`,
      allowedMentions: { users: [] },
    })
    return
  }

  return interaction.reply({
    content: `Instructor <@${instructorUser.id}> has been added to course #${id} successfully.`,
    allowedMentions: { users: [] },
  })
}

async function removeInstructorCommand(
  interaction: ChatInputCommandInteraction,
) {
  const id = interaction.options.getInteger("id", true)
  const instructorUser = interaction.options.getUser("instructor", true)

  // Check if course exists
  const course = db.getCourse(id)
  if (!course) {
    return interaction.reply({
      content: `Course #${id} not found.`,
      flags: "Ephemeral",
    })
  }

  // Check if instructor exists
  const instructor = db.getInstructorByDiscordId(instructorUser.id)
  if (!instructor) {
    return interaction.reply({
      content: `Instructor <@${instructorUser.id}> is not registered.`,
      flags: "Ephemeral",
      allowedMentions: { users: [] },
    })
  }

  // Check if instructor is added to the course
  const existingInstructors = db.getCourseInstructors(id)
  if (!existingInstructors.some((i) => i.id === instructor.id)) {
    return interaction.reply({
      content: `Instructor <@${instructorUser.id}> is not teaching #${id}.`,
      flags: "Ephemeral",
      allowedMentions: { users: [] },
    })
  }

  db.removeCourseInstructor(id, instructor.id)

  return interaction.reply({
    content: `Instructor <@${instructorUser.id}> has been removed from #${id} successfully.`,
    allowedMentions: { users: [] },
  })
}

async function editCommand(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getInteger("id", true)
  const module = interaction.options.getInteger("module")

  const course = db.getCourse(id)
  if (!course) {
    return interaction.reply({
      content: `Course with ID ${id} not found.`,
      flags: "Ephemeral",
    })
  }

  if (module) course.module = module
  db.updateCourse(course)

  await interaction.reply({
    content: `Course LIVE #${id} has been updated successfully.`,
  })
}

async function removeCommand(interaction: ChatInputCommandInteraction) {
  // FIXME: Ask for confirmation first
  const id = interaction.options.getInteger("id", true)
  const course = db.getCourse(id)
  if (!course) {
    return interaction.reply({
      content: `Course with ID ${id} not found.`,
      flags: "Ephemeral",
    })
  }
  await interaction.deferReply()

  const lessons = db.getCourseLessons(id)
  for (const lesson of lessons) {
    deleteCalendarEvent(lesson.id) // Intentially not awaited
  }

  db.removeCourse(id)

  await interaction.editReply({
    content: `Course LIVE #${id} has been removed successfully.`,
  })
}

async function autocompleteCourseId(interaction: AutocompleteInteraction) {
  const focusedValue = interaction.options.getFocused(true).value
  const courses = db.getAllCourses()
  const filtered = courses.filter((course) =>
    course.id.toString().startsWith(focusedValue.toString()),
  )
  return filtered.slice(0, 25).map((course) => ({
    name: `#${course.id} (Module ${course.module})`,
    value: course.id,
  }))
}
