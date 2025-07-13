import {
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ButtonInteraction,
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

  const lesson = db.getLesson(lessonId)
  if (!lesson) {
    return interaction.reply({
      content: "This lesson does not exist.",
      flags: "Ephemeral",
    })
  }

  const customId = Math.random().toString(36).substring(2, 15)

  const response = await interaction.reply({
    content: `Are you sure you want to request a sub for #${lesson.course_id} ${lesson.abbrev} on ${formatTimestamp(lesson.date)}?`,
    flags: "Ephemeral",
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel("Yes, request a sub")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
    withResponse: true,
  })
  const message = response.resource!.message!

  let buttonInteraction: ButtonInteraction
  try {
    buttonInteraction = (await message.awaitMessageComponent({
      filter: (i) => i.customId === customId,
      time: 60_000,
    })) as ButtonInteraction
  } catch {
    return interaction.editReply({
      content: "You took too long to respond. Please try again.",
      components: [],
    })
  }

  await buttonInteraction.deferUpdate()

  const subRequestId = db.addSubRequest(lessonId, instructor.id, reason)

  const channelId = db.subChannelId
  if (channelId) {
    const channel = interaction.guild?.channels.cache.get(channelId)
    if (channel && channel.isTextBased()) {
      await channel.send({
        content: `Sub request for lesson #${lesson.course_id} ${lesson.abbrev} on ${formatTimestamp(lesson.date)} by <@${interaction.user.id}>${
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

  await buttonInteraction.followUp({
    content: "You have successfully asked for a sub.",
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
  return lessons
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((lesson) => ({
      name: `#${lesson.course_id} ${lesson.abbrev} - ${lesson.date.toLocaleDateString(
        "en-CA",
        { timeZone: timezone },
      )}${timezone === "UTC" ? " (UTC)" : ""}`,
      value: lesson.id,
    }))
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
  db.removeLessonInstructor(lessonId, subRequest.instructor_id)
  db.addLessonInstructor(lessonId, instructor.id, {
    isSub: true,
    isFreeWill: true,
  })
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
  const notifyChannel = notifyChannelId
    ? client.channels.cache.get(notifyChannelId)
    : null
  if (notifyChannel && !notifyChannel.isSendable()) return

  const subChannelId = db.subChannelId
  const subChannel = subChannelId
    ? client.channels.cache.get(subChannelId)
    : null
  if (subChannel && !subChannel.isSendable()) return

  const adminRoleId = db.adminRoleId
  const adminPing = adminRoleId ? `<@&${adminRoleId}>` : "@admins"

  const teachingRoleId = db.teachingRoleId
  const teachingPing = teachingRoleId ? `<@&${teachingRoleId}>` : "@everyone"

  for (const subRequest of subRequests) {
    const lesson = db.getLesson(subRequest.lesson_id)!
    const now = new Date()
    if (lesson.date.getTime() - now.getTime() > 24 * 60 * 60 * 1000) {
      continue
    }

    const instructor = db.getInstructor(subRequest.instructor_id)
    if (!instructor) continue

    if (lesson.date.getTime() - now.getTime() < 60 * 60 * 1000) {
      if (subRequest.sent_notification >= 2) continue
      await subChannel?.send({
        content: `‼️ ${teachingPing} The sub request for #${lesson.course_id} ${lesson.abbrev} on ${formatTimestamp(lesson.date)} by <@${instructor.discord_id}> is still open! Please help out if you can!`,
        allowedMentions: {
          roles: teachingRoleId ? [teachingRoleId] : [],
          users: [],
          parse: ["everyone"],
        },
      })
      subRequest.sent_notification = 2
      db.updateSubRequest(subRequest)
      continue
    }

    if (subRequest.sent_notification >= 1) continue
    await notifyChannel?.send({
      content: `‼️ ${adminPing} The sub request for #${lesson.course_id} ${lesson.abbrev} on ${formatTimestamp(lesson.date)} by <@${instructor.discord_id}> is still open! I will ping @Teaching 1 hour before the lesson, but it might be a good idea to start DMing people.`,
      allowedMentions: {
        roles: adminRoleId ? [adminRoleId] : [],
        users: [],
      },
    })

    subRequest.sent_notification = 1
    db.updateSubRequest(subRequest)
  }
}

async function onReady(client: Client<true>) {
  setInterval(() => checkSubRequests(client), 60 * 1000)
  console.log("Checking for open sub requests...")
  await checkSubRequests(client)
  console.log("Setting up interval to check for sub requests every minute...")
}
