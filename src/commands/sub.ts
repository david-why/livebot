import {
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ButtonStyle,
  type ApplicationCommandOptionChoiceData,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js"
import { createCommand } from "../utils/discordjs"
import { db } from "../database"
import { formatTimestamp } from "../utils/format"

export const { command, execute, events } = createCommand(
  (command) =>
    command
      .setHandler(handler)
      .setName("sub")
      .setDescription("Manage sub requests")
      .addNumberOption((option) =>
        option
          .setName("lesson")
          .setDescription("The lesson to request a sub for")
          .setRequired(true)
          .setAutocomplete(true),
      )
      .addStringOption((option) =>
        option
          .setName("reason")
          .setDescription("The reason for the sub request"),
      ),
  {
    autocomplete: {
      lesson: lessonAutocomplete,
    },
    events: {
      interactionCreate: handleAcceptSubButton,
    },
  },
)

async function handler(interaction: ChatInputCommandInteraction) {
  const lessonId = interaction.options.getNumber("lesson", true)
  const reason = interaction.options.getString("reason")

  const instructor = db.getInstructor(interaction.user.id)
  if (!instructor) {
    return interaction.reply({
      content: "You are not registered as an instructor.",
      flags: "Ephemeral",
    })
  }

  const subRequestId = db.addSubRequest(lessonId, instructor.id, reason)

  const channelId = db.subChannelId
  if (channelId) {
    const channel = interaction.guild?.channels.cache.get(channelId)
    if (channel && channel.isTextBased()) {
      const timezone = db.getUserTimezone(interaction.user.id) ?? "UTC"
      const lesson = db.getLesson(lessonId)!
      await channel.send({
        content: `Sub request for lesson #${lesson.course_id} ${lesson.abbrev} on ${formatTimestamp(lesson.date)} (${timezone}) by <@${interaction.user.id}>${
          reason ? `: ${reason}` : ""
        }`,
        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`accept_sub_${subRequestId}`)
                .setLabel("Take!")
                .setEmoji("✅"),
            )
            .toJSON(),
        ],
      })
    }
  }

  await interaction.reply({
    content: "You have successfully asked for a sub.",
    flags: "Ephemeral",
  })
}

async function lessonAutocomplete(
  interaction: AutocompleteInteraction,
): Promise<ApplicationCommandOptionChoiceData[]> {
  const instructorId = db.getInstructor(interaction.user.id)?.id
  if (!instructorId) {
    return []
  }
  const lessons = db.getInstructorLessons(instructorId)
  const timezone = db.getUserTimezone(interaction.user.id) ?? "UTC"
  return lessons.map((lesson) => {
    return {
      name: `#${lesson.course_id} ${lesson.abbrev} - ${lesson.date.toLocaleDateString(
        "en-CA",
        { timeZone: timezone },
      )}${timezone === "UTC" ? " (UTC)" : ""}`,
      value: lesson.id,
    }
  })
}

async function handleAcceptSubButton(interaction: BaseInteraction) {
  if (!interaction.isButton()) return
  if (!interaction.customId.startsWith("accept_sub_")) return

  const subRequestId = parseInt(interaction.customId.split("_")[2]!)
  const subRequest = db.getSubRequest(subRequestId)
  if (!subRequest) {
    return interaction.reply({
      content: "This sub request no longer exists.",
      flags: "Ephemeral",
    })
  }

  const instructor = db.getInstructor(interaction.user.id)
  if (!instructor) {
    return interaction.reply({
      content: "You are not registered as an instructor.",
      flags: "Ephemeral",
    })
  }
  if (instructor.id === subRequest.instructor_id) {
    return interaction.reply({
      content: "You cannot take your own sub request.",
      flags: "Ephemeral",
    })
  }

  const lessonId = subRequest.lesson_id
  db.deleteLessonInstructor(lessonId, subRequest.instructor_id)
  db.addLessonInstructor(lessonId, instructor.id, true)
  subRequest.is_open = 0
  db.updateSubRequest(subRequest)

  await interaction.reply({
    content: `You have taken the sub request for this lesson.`,
    flags: "Ephemeral",
  })
  await interaction.message.edit({
    content:
      `${interaction.message.content}\n\n` +
      `<@${interaction.user.id}> has taken this sub request.`,
    components: [],
  })
}
