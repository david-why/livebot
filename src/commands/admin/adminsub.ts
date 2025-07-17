import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
} from "discord.js"
import { createCommandGroup } from "../../utils/discordjs"
import { db } from "../../database"
import { sendSubRequestTakenMessage, updateSubRequestMessages } from "../sub"

export const { command, execute, events } = createCommandGroup(
  (builder) =>
    builder
      .setName("adminsub")
      .setDescription("[ADMIN] Commands for managing sub requests")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  {
    fill: (sub) =>
      sub
        .setHandler(fillCommand)
        .setDescription("[ADMIN] Fill a sub request")
        .addNumberOption((option) =>
          option
            .setName("sub-request")
            .setDescription("The sub request to fill")
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addUserOption((option) =>
          option
            .setName("instructor")
            .setDescription("The instructor that fills the sub request")
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("freewill")
            .setDescription(
              "Is this instructor a free will sub? Defaults to false",
            ),
        ),
  },
  {
    autocomplete: {
      fill: {
        "sub-request": autocompleteSubRequest,
      },
    },
  },
)

async function fillCommand(interaction: ChatInputCommandInteraction) {
  const subRequestId = interaction.options.getNumber("sub-request", true)
  const instructorUser = interaction.options.getUser("instructor", true)
  const freeWill = interaction.options.getBoolean("freewill") ?? false

  const subRequest = db.getSubRequest(subRequestId)
  if (!subRequest) {
    return interaction.reply({
      content: "Sub request not found.",
      flags: "Ephemeral",
    })
  }
  if (subRequest.filled_by) {
    return interaction.reply({
      content: "This sub request has already been filled.",
      flags: "Ephemeral",
    })
  }

  const instructor = db.getInstructorByDiscordId(instructorUser.id)
  if (!instructor) {
    return interaction.reply({
      content: "This user is not a registered instructor.",
      flags: "Ephemeral",
    })
  }

  const lessonId = subRequest.lesson_id

  db.removeLessonInstructor(lessonId, subRequest.instructor_id)
  db.addLessonInstructor(lessonId, instructor.id, {
    isSub: true,
    isFreeWill: freeWill,
  })

  subRequest.filled_by = instructor.id
  subRequest.filledDate = new Date()
  subRequest.is_open = 0
  db.updateSubRequest(subRequest)

  const lesson = db.getLesson(lessonId)!
  lesson.google_event_outdated = 1
  db.updateLesson(lesson)

  updateSubRequestMessages(interaction.client) // Intentionally not awaited
  sendSubRequestTakenMessage(interaction.client, subRequest) // Intentionally not awaited

  return interaction.reply({
    content: `Sub request filled by <@${instructorUser.id}> (${instructor.name})`,
    flags: "Ephemeral",
    allowedMentions: { users: [] },
  })
}

async function autocompleteSubRequest(interaction: AutocompleteInteraction) {
  const value = interaction.options.getFocused(true).value

  const timezone = db.getUserTimezone(interaction.user.id) ?? "UTC"

  const subRequests = db.getOpenSubRequests()
  const choices = subRequests
    .sort((a, b) => a.opened_at - b.opened_at)
    .map((r) => {
      const lesson = db.getLesson(r.lesson_id)!
      const instructor = db.getInstructor(r.instructor_id)!
      return {
        name: `#${lesson.course_id} ${lesson.name}, for ${instructor.name}, ${lesson.date.toLocaleString(
          "en-CA",
          {
            timeZone: timezone,
          },
        )} (${timezone})`,
        value: r.id,
      }
    })

  return choices.filter((choice) =>
    choice.name.toLowerCase().includes(value.toLowerCase()),
  )
}
