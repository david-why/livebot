import {
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  Client,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ApplicationCommandOptionChoiceData,
  type AutocompleteInteraction,
  type ChatInputCommandInteraction,
} from "discord.js"
import { createCommand } from "../utils/discordjs"
import { db } from "../database"
import { formatTimestamp } from "../utils/format"
import type { SubRequest } from "../models/sub_request"

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
      interactionCreate: handleAcceptSubMenu,
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

  db.addSubRequest(lessonId, instructor.id, reason)
  updateSubRequestMessages(interaction.client) // Intentionally not awaited

  await buttonInteraction.editReply({
    content: "You have successfully asked for a sub.",
    components: [],
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
    .filter((lesson) => lesson.date.getTime() > Date.now())
    .map((lesson) => ({
      name: `#${lesson.course_id} ${lesson.abbrev} - ${lesson.date.toLocaleDateString(
        "en-CA",
        { timeZone: timezone },
      )} (${timezone})`,
      value: lesson.id,
    }))
}

async function handleAcceptSubMenu(interaction: BaseInteraction) {
  if (!interaction.isStringSelectMenu()) return
  if (interaction.customId !== "accept_sub_menu") return

  const subRequestId = parseInt(interaction.values[0]!)
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
  const lesson = db.getLesson(lessonId)!

  const response = await interaction.reply({
    content: `Are you sure you want to take the sub request for #${lesson.course_id} ${lesson.abbrev} on ${formatTimestamp(lesson.date)}?`,
    flags: "Ephemeral",
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("accept_sub_button")
          .setLabel("Yes, take the sub request")
          .setStyle(ButtonStyle.Primary),
      ),
    ],
    withResponse: true,
  })
  const message = response.resource!.message!

  let buttonInteraction: ButtonInteraction
  try {
    buttonInteraction = (await message.awaitMessageComponent({
      filter: (i) => i.customId === "accept_sub_button",
      time: 60_000,
    })) as ButtonInteraction
  } catch {
    return interaction.editReply({
      content: "You took too long to respond. Please try again.",
      components: [],
    })
  }

  db.removeLessonInstructor(lessonId, subRequest.instructor_id)
  db.addLessonInstructor(lessonId, instructor.id, {
    isSub: true,
    isFreeWill: true,
  })
  subRequest.is_open = 0
  subRequest.filled_by = instructor.id
  subRequest.filledDate = new Date()
  db.updateSubRequest(subRequest)

  lesson.google_event_outdated = 1
  db.updateLesson(lesson)

  updateSubRequestMessages(interaction.client) // Intentionally not awaited
  sendSubRequestTakenMessage(interaction.client, subRequest) // Intentionally not awaited

  await buttonInteraction.update({
    content: `You have taken the sub request for this lesson.`,
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

let isUpdatingSubRequests = false
let shouldReupdateSubRequests = false

export async function updateSubRequestMessages(client: Client<true>) {
  if (isUpdatingSubRequests) {
    shouldReupdateSubRequests = true
    return
  }
  isUpdatingSubRequests = true
  try {
    const subChannelId = db.subChannelId
    if (!subChannelId) return
    const subChannel = client.channels.cache.get(subChannelId)
    if (!subChannel || !subChannel.isSendable() || subChannel.isDMBased())
      return

    const existingSubMessageIds = db.getSubBotMessages()
    const deleted = await subChannel.bulkDelete(existingSubMessageIds)
    const toDelete = existingSubMessageIds.filter((id) => !deleted.has(id))
    for (const id of toDelete) {
      subChannel.messages.delete(id).catch(() => {}) // Intentionally not awaited
    }
    db.removeSubBotMessages(existingSubMessageIds)

    const contentLines: { content: string; label: string; id: number }[] = []
    const subRequests = db.getOpenSubRequests()
    for (const subRequest of subRequests) {
      const lesson = db.getLesson(subRequest.lesson_id)!
      const course = db.getCourse(lesson.course_id)!
      const instructor = db.getInstructor(subRequest.instructor_id)!

      const content = `${formatTimestamp(lesson.date)}, Live ${lesson.course_id}, M${course.module}${lesson.abbrev} (sub for <@${instructor.discord_id}>${subRequest.reason ? `: ${subRequest.reason}` : ""})`
      const label = `#${lesson.course_id} M${course.module}${lesson.abbrev}`

      contentLines.push({ content, label, id: subRequest.id })
    }

    if (contentLines.length === 0) {
      const message = await subChannel.send({
        content: "There are currently no open sub requests.",
      })
      db.addSubBotMessages([message.id])
      return
    }

    let currentContent: string = ""
    const currentOptions: StringSelectMenuOptionBuilder[] = []

    const sendCurrentContent = async () => {
      if (currentContent.length === 0) return
      const selectMenus: StringSelectMenuBuilder[] = []
      // 25 options per menu
      for (let i = 0; i < currentOptions.length; i += 25) {
        const options = currentOptions.slice(i, i + 25)
        selectMenus.push(
          new StringSelectMenuBuilder()
            .setCustomId("accept_sub_menu")
            .setPlaceholder(`Accept a sub request`)
            .addOptions(options),
        )
      }
      const message = await subChannel.send({
        // content: currentContent.trim(),
        embeds: [
          new EmbedBuilder()
            .setTitle("Open Sub Requests")
            .setDescription(currentContent.trim()),
        ],
        components: selectMenus.map((menu) =>
          new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
        ),
        allowedMentions: { users: [] },
      })
      await message.pin()
      console.log("pinned")
      db.addSubBotMessages([message.id])
      currentContent = ""
      currentOptions.length = 0
    }

    for (const { content, label, id } of contentLines) {
      if (
        currentOptions.length >= 75 ||
        currentContent.length + content.length > 4096
      ) {
        await sendCurrentContent()
      }
      currentContent += content + "\n\n"
      currentOptions.push(
        new StringSelectMenuOptionBuilder().setLabel(label).setValue(`${id}`),
      )
    }
    await sendCurrentContent()
  } finally {
    isUpdatingSubRequests = false
    if (shouldReupdateSubRequests) {
      shouldReupdateSubRequests = false
      updateSubRequestMessages(client) // Intentionally not awaited
    }
  }
}

export function sendSubRequestTakenMessage(
  client: Client<true>,
  subRequest: SubRequest,
  isFreeWill: boolean = true,
) {
  const channelId = db.filledSubChannelId
  if (!channelId) return
  const channel = client.channels.cache.get(channelId)
  if (!channel || !channel.isSendable() || channel.isDMBased()) return

  const lesson = db.getLesson(subRequest.lesson_id)!
  const course = db.getCourse(lesson.course_id)!
  const instructor = db.getInstructor(subRequest.instructor_id)!
  const filledInstructor = db.getInstructor(subRequest.filled_by!)!

  const content = `~~${formatTimestamp(lesson.date)}, Live ${lesson.course_id}, M${course.module}${lesson.abbrev} (sub for <@${instructor.discord_id}>${subRequest.reason ? `: ${subRequest.reason}` : ""})~~ <@${filledInstructor.discord_id}>${isFreeWill ? " ★" : ""}`

  return channel.send({
    content,
    allowedMentions: { users: [filledInstructor.discord_id] },
  })
}
