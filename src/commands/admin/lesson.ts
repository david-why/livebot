import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js"
import { createCommandGroup } from "../../utils/discordjs"
import { db } from "../../database"

export const { command, execute, events } = createCommandGroup(
  (builder) =>
    builder
      .setName("lesson")
      .setDescription("[ADMIN] Manage lessons")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  {
    "add-instructor": (sub) =>
      sub
        .setHandler(addInstructorCommand)
        .setDescription("[ADMIN] Add an instructor to a lesson")
        .addNumberOption((option) =>
          option
            .setName("lesson")
            .setDescription("The lesson to add an instructor for")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName("instructor")
            .setDescription("The instructor to add")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("sub")
            .setDescription("Is this instructor a sub? Defaults to false"),
        )
        .addBooleanOption((option) =>
          option
            .setName("freewill")
            .setDescription(
              "Is this instructor a free will sub? Defaults to false",
            ),
        ),
    "remove-instructor": (sub) =>
      sub
        .setHandler(removeInstructorCommand)
        .setDescription("[ADMIN] Remove an instructor from a lesson")
        .addNumberOption((option) =>
          option
            .setName("lesson")
            .setDescription("The lesson to remove an instructor from")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName("instructor")
            .setDescription("The instructor to remove")
            .setRequired(true),
        ),
  },
  {
    autocomplete: {
      "add-instructor": {
        lesson: autocompleteLessons,
      },
      "remove-instructor": {
        lesson: autocompleteLessons,
      },
    },
  },
)

async function addInstructorCommand(interaction: ChatInputCommandInteraction) {
  const lessonId = interaction.options.getNumber("lesson", true)
  const instructorUser = interaction.options.getUser("instructor", true)
  const isSub = interaction.options.getBoolean("sub") ?? false
  const isFreeWill = interaction.options.getBoolean("freewill") ?? false

  const instructor = db.getInstructorByDiscordId(instructorUser.id)
  if (!instructor) {
    return interaction.reply({
      content: `<@${instructorUser.id}> is not registered as an instructor.`,
      flags: "Ephemeral",
      allowedMentions: { users: [] },
    })
  }

  const existingInstructors = db.getLessonInstructors(lessonId)

  if (existingInstructors.some((i) => i.id === instructor.id)) {
    db.removeLessonInstructor(lessonId, instructor.id)
  } else if (existingInstructors.length >= 2) {
    return interaction.reply({
      content: `This lesson already has 2 instructors. Please remove one before adding another.`,
      flags: "Ephemeral",
    })
  }

  db.addLessonInstructor(lessonId, instructor.id, {
    isSub,
    isFreeWill,
  })

  const lesson = db.getLesson(lessonId)!
  lesson.google_event_outdated = 1
  db.updateLesson(lesson)

  return interaction.reply({
    content: `Added <@${instructorUser.id}> as an instructor for lesson #${lesson.course_id} ${lesson.abbrev}.`,
    allowedMentions: { users: [] },
  })
}

async function removeInstructorCommand(
  interaction: ChatInputCommandInteraction,
) {
  const lessonId = interaction.options.getNumber("lesson", true)
  const instructorUser = interaction.options.getUser("instructor", true)

  const instructor = db.getInstructorByDiscordId(instructorUser.id)
  if (!instructor) {
    return interaction.reply({
      content: `<@${instructorUser.id}> is not registered as an instructor.`,
      flags: "Ephemeral",
      allowedMentions: { users: [] },
    })
  }
  const existingInstructors = db.getLessonInstructors(lessonId)
  if (!existingInstructors.some((i) => i.id === instructor.id)) {
    return interaction.reply({
      content: `<@${instructorUser.id}> is not an instructor for this lesson. The instructors are ${existingInstructors
        .map((i) => `<@${i.discord_id}>`)
        .join(" & ")}`,
      flags: "Ephemeral",
      allowedMentions: { users: [] },
    })
  }
  db.removeLessonInstructor(lessonId, instructor.id)
  const lesson = db.getLesson(lessonId)!
  lesson.google_event_outdated = 1
  db.updateLesson(lesson)
  return interaction.reply({
    content: `Removed <@${instructorUser.id}> as an instructor for lesson #${lesson.course_id} ${lesson.abbrev}.`,
    allowedMentions: { users: [] },
  })
}

async function autocompleteLessons(interaction: AutocompleteInteraction) {
  const focusedOption = interaction.options.getFocused(true)

  const timezone = db.getUserTimezone(interaction.user.id) ?? "UTC"

  const lessons = db.getAllFutureLessons()
  const choices = lessons.map((lesson) => ({
    name: `#${lesson.course_id} ${lesson.abbrev} - ${lesson.date.toLocaleString(
      "en-CA",
      { timeZone: timezone },
    )} (${timezone})`,
    value: lesson.id,
  }))

  const filteredChoices = choices.filter((choice) =>
    choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()),
  )

  return filteredChoices
}
