import {
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ButtonStyle,
  Client,
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
      ready: onReady,
    },
  },
)

async function handler(interaction: ChatInputCommandInteraction) {
  const lessonId = interaction.options.getNumber("lesson", true)
  const reason = interaction.options.getString("reason")

  const instructor = db.getInstructorByDiscordId(interaction.user.id)
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
  const instructorId = db.getInstructorByDiscordId(interaction.user.id)?.id
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

  const instructor = db.getInstructorByDiscordId(interaction.user.id)
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

async function checkSubRequests(client: Client<true>) {
  const subRequests = db.getOpenSubRequests()
  if (subRequests.length === 0) return

  const notifyChannelId = db.subNotifyChannelId
  if (!notifyChannelId) return

  const channel = client.channels.cache.get(notifyChannelId)
  if (!channel || !channel.isSendable()) return

  const adminRoleId = db.adminRoleId
  const adminPing = adminRoleId ? `<@&${adminRoleId}>` : "@admins"

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const promises: Promise<any>[] = []

  for (const subRequest of subRequests) {
    if (subRequest.sent_notification) return

    const lesson = db.getLesson(subRequest.lesson_id)!
    const now = new Date()
    if (lesson.date.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
      continue
    }

    const instructor = db.getInstructor(subRequest.instructor_id)
    if (!instructor) continue

    promises.push(
      channel.send({
        content: `‼️ ${adminPing} The sub request for lesson #${lesson.course_id} ${lesson.abbrev} on ${formatTimestamp(lesson.date)} by <@${instructor.discord_id}> is still open! I will ping @Teaching 1 hour before the lesson, but it might be a good idea to start DMing people.`,
        allowedMentions: {
          roles: adminRoleId ? [adminRoleId] : [],
          users: [],
        },
      }),
    )

    subRequest.sent_notification = 1
    db.updateSubRequest(subRequest)
  }

  await Promise.all(promises)
}

async function onReady(client: Client<true>) {
  setInterval(() => checkSubRequests(client), 60 * 1000)
}
