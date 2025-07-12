import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  ComponentType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextChannel,
} from "discord.js"
import type { DateTime } from "luxon"
import { lessonAbbreviations, lessonNames, modules } from "../consts"
import { db } from "../database"
import { parseDatesString } from "../utils/dates"
import { createCommandGroup } from "../utils/discordjs"
import { formatTimestamp } from "../utils/format"

export const { command, execute, events } = createCommandGroup(
  (builder) =>
    builder
      .setName("course")
      .setDescription("Manage and view courses")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  {
    list: (sub) =>
      sub.setHandler(listCommand).setDescription("List all courses"),
    info: (sub) =>
      sub
        .setHandler(infoCommand)
        .setDescription("Get information about a course")
        .addNumberOption((option) =>
          option
            .setName("id")
            .setDescription("The ID of the course")
            .setRequired(true)
            .setAutocomplete(true),
        ),
    add: (sub) =>
      sub
        .setHandler(addCommand)
        .setDescription("Add a new course")
        .addNumberOption((option) =>
          option
            .setName("id")
            .setDescription("ID of the course")
            .setRequired(true),
        )
        .addNumberOption((option) =>
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
        .setDescription("Add an instructor to a course")
        .addNumberOption((option) =>
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
        ),
    "remove-instructor": (sub) =>
      sub
        .setHandler(removeInstructorCommand)
        .setDescription("Remove an instructor from a course")
        .addNumberOption((option) =>
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
        .setDescription("Edit an existing course")
        .addNumberOption((option) =>
          option
            .setName("id")
            .setDescription("ID of the course to edit")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addNumberOption((option) =>
          option
            .setName("module")
            .setDescription("Module number of the course")
            .setRequired(false)
            .setChoices(modules),
        )
        .addBooleanOption((option) =>
          option
            .setName("dates")
            .setDescription("Whether to edit the course dates")
            .setRequired(false),
        ),
    remove: (sub) =>
      sub
        .setHandler(removeCommand)
        .setName("remove")
        .setDescription("Remove an existing course")
        .addNumberOption((option) =>
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

async function listCommand(interaction: ChatInputCommandInteraction) {
  const courses = db.getAllCourses()
  if (courses.length === 0) {
    return interaction.reply({
      content: "No courses found.",
    })
  }
  const courseList = courses
    .map((course) => `- LIVE #${course.id} (Module ${course.module})`)
    .join("\n")
  await interaction.reply({
    content: `Existing courses:\n${courseList}`,
  })
}

async function infoCommand(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getNumber("id", true)
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
        .map((i) => `<@${i.discord_id}>`)
        .join(" & ")
      return `- ${lesson.name}, ${instructorMentions} (${formatTimestamp(lesson.date)})`
    })
    .join("\n")
  await interaction.reply({
    content:
      `Course LIVE #${id} (Module ${course.module})\n` +
      `Instructors: ${instructors.map((i) => `<@${i.discord_id}>`).join(", ")}\n` +
      `Scheduled dates:\n${scheduledDates}`,
    allowedMentions: { users: [] },
  })
}

async function addCommand(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getNumber("id", true)
  const module = interaction.options.getNumber("module", true)
  const time = interaction.options.getString("time", true)
  const datesString = interaction.options.getString("dates", true)
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

  db.addCourse(id, module)
  db.addCourseInstructors(id, instructorIds)
  for (let i = 0; i < dates.length; i++) {
    db.addCourseLesson(
      id,
      dates[i]!.toJSDate(),
      lessonNames[i]!,
      lessonAbbreviations[i]!,
    )
  }

  await interaction.reply({
    content: `Course LIVE #${id} M${module} created successfully with ${dates.length} date(s).`,
  })
  return
}

async function addInstructorCommand(interaction: ChatInputCommandInteraction) {
  const id = interaction.options.getNumber("id", true)
  const instructorUser = interaction.options.getUser("instructor", true)

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

  return interaction.reply({
    content: `Instructor <@${instructorUser.id}> has been added to course #${id} successfully.`,
    allowedMentions: { users: [] },
  })
}

async function removeInstructorCommand(
  interaction: ChatInputCommandInteraction,
) {
  const id = interaction.options.getNumber("id", true)
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
  const id = interaction.options.getNumber("id", true)
  const module = interaction.options.getNumber("module")
  const editDates = interaction.options.getBoolean("dates") ?? false

  const course = db.getCourse(id)
  if (!course) {
    return interaction.reply({
      content: `Course with ID ${id} not found.`,
      flags: "Ephemeral",
    })
  }

  if (module) course.module = module
  db.updateCourse(course)

  if (editDates) {
    const userTimezone = db.getUserTimezone(interaction.user.id) ?? "UTC"
    const lessons = db.getCourseLessons(id)
    const response = await interaction.reply({
      content: `Please select a lesson from LIVE #${id} below to edit.\n\n-# Times are in \`${userTimezone}\`; use /timezone to change it.`,
      components: [
        new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`edit`)
              .setPlaceholder("Select a lesson to edit")
              .addOptions(
                lessons.map((lesson) => ({
                  label: lesson.date.toLocaleString("en-US", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: userTimezone,
                  }),
                  value: lesson.id.toString(),
                })),
              ),
          )
          .toJSON(),
        new ActionRowBuilder()
          .addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`delete`)
              .setPlaceholder("Select a lesson to delete")
              .addOptions(
                lessons.map((lesson) => ({
                  label: lesson.date.toLocaleString("en-US", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: userTimezone,
                  }),
                  value: lesson.id.toString(),
                })),
              ),
          )
          .toJSON(),
      ],
      withResponse: true,
    })
    const message = response.resource!.message!
    let selectedLessonId: number
    let action: "edit" | "delete"
    try {
      const result = await message.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 10 * 60 * 1000,
      }) // 10 minutes
      await result.deferUpdate()
      selectedLessonId = Number(result.values[0])
      action = result.customId as "edit" | "delete"
    } catch {
      return interaction.editReply({
        components: [],
      })
    }
    const selectedLesson = lessons.find(
      (lesson) => lesson.id === selectedLessonId,
    )!
    if (action === "edit") {
      const response = await interaction.followUp({
        content: `Please enter the new date for the lesson on ${formatTimestamp(selectedLesson.date)} (in UTC):\n\nUse \`cancel\` to cancel.`,
        withResponse: true,
      })
      let newDate: Date | null = null
      try {
        const message = await (response.channel as TextChannel).awaitMessages({
          filter: (m) => m.author.id === interaction.user.id,
          max: 1,
          time: 10 * 60 * 1000,
          errors: ["time"],
        })
        const content = message.first()!.content.trim()
        if (content === "cancel") {
          return interaction.followUp("Canceled.")
        }
        // FIXME: Parse as UTC date like in /course add
        const parsedDate = Date.parse(content)
        if (!isNaN(parsedDate)) {
          newDate = new Date(parsedDate)
        }
      } catch {
        return interaction.followUp({
          content: "No date provided in the given time. Please try again.",
        })
      }
      if (!newDate) {
        return interaction.followUp({
          content: "Invalid date format. Please use `YYYY-MM-DD HH:MM`.",
        })
      }
      // Update lesson date
      selectedLesson.date = newDate
      db.updateLesson(selectedLesson)
      return interaction.followUp({
        content: `Lesson has been updated successfully.`,
      })
    } else if (action === "delete") {
      // Delete lesson
      db.removeLesson(selectedLessonId)
      return interaction.followUp({
        content: `Lesson has been deleted successfully.`,
      })
    }
  } else {
    await interaction.reply({
      content: `Course LIVE #${id} has been updated successfully.`,
    })
  }
}

async function removeCommand(interaction: ChatInputCommandInteraction) {
  // FIXME: Ask for confirmation first
  const id = interaction.options.getNumber("id", true)
  const course = db.getCourse(id)
  if (!course) {
    return interaction.reply({
      content: `Course with ID ${id} not found.`,
      flags: "Ephemeral",
    })
  }

  db.removeCourse(id)

  await interaction.reply({
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
    name: `LIVE #${course.id} (Module ${course.module})`,
    value: course.id,
  }))
}
