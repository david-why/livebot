import {
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type ChatInputCommandInteraction,
} from "discord.js"
import { db } from "../database"
import type { Lesson } from "../models/lesson"
import { createCommand, wrapEventHandler } from "../utils/discordjs"
import {
  formatLessonInstructorsCompact,
  formatTimestamp,
} from "../utils/format"
import { handleAddSubRequest } from "./sub"

export const { command, execute, events } = createCommand(
  (builder) =>
    builder
      .setHandler(handler)
      .setName("lessons")
      .setDescription("View your lessons")
      .addBooleanOption((option) =>
        option.setName("past").setDescription("Include past lessons"),
      ),
  {
    events: {
      interactionCreate: wrapEventHandler(handlePageChange, handleSubMenu),
    },
  },
)

async function handler(interaction: ChatInputCommandInteraction) {
  const past = interaction.options.getBoolean("past") ?? false

  const instructor = db.getInstructorByDiscordId(interaction.user.id)
  if (!instructor) {
    return interaction.reply({
      content: "You are not an instructor.",
      flags: "Ephemeral",
    })
  }

  await interaction.deferReply({ flags: "Ephemeral" })

  const messages = await getUserLessonsMessages(
    interaction.user.id,
    past ? "all" : "future",
  )
  if (messages.length === 0) {
    return interaction.followUp({
      content: "You have no lessons.",
    })
  }

  return interaction.followUp(messages[0]!)
}

async function handlePageChange(interaction: BaseInteraction) {
  if (!interaction.isButton()) return
  const match = interaction.customId.match(/^lessons_page_(\d+)_(\d+)_(\w+)$/)
  if (!match) return

  const page = parseInt(match[1]!, 10)
  const userId = match[2]!
  const type = match[3] as "future" | "all"

  await interaction.deferUpdate()

  const messages = await getUserLessonsMessages(userId, type)
  if (messages.length === 0) {
    return interaction.reply({
      content: "You have no lessons.",
      flags: "Ephemeral",
    })
  }

  return interaction.editReply(messages[page >= messages.length ? 0 : page]!)
}

async function handleSubMenu(interaction: BaseInteraction) {
  if (!interaction.isStringSelectMenu()) return
  if (interaction.customId !== "lessons_sub_select") return

  const lessonId = parseInt(interaction.values[0]!, 10)

  await handleAddSubRequest(interaction, lessonId)
}

async function getUserLessonsMessages(userId: string, type: "future" | "all") {
  const instructor = db.getInstructorByDiscordId(userId)!

  const lessons =
    type === "future"
      ? db.getFutureInstructorLessons(instructor.id)
      : db.getInstructorLessons(instructor.id)
  if (lessons.length === 0) {
    return []
  }

  lessons.sort((a, b) => a.date.getTime() - b.date.getTime())

  const messages: {
    flags: "IsComponentsV2"
    components:
      | [ContainerBuilder, ActionRowBuilder<StringSelectMenuBuilder>]
      | [ContainerBuilder]
    allowedMentions: { users: [] }
  }[] = []
  let currentContent = ""
  let currentLessons: Lesson[] = []
  let currentPage = 0

  const pushCurrentMessage = () => {
    if (currentContent) {
      const options = currentLessons
        .filter((l) => l.date.getTime() > Date.now())
        .map((l) => ({
          label: `#${l.course_id} ${l.name}`,
          value: l.id.toString(),
        }))
      const lessonsText = new TextDisplayBuilder().setContent(
        "## Your Lessons\n" + currentContent,
      )
      const subSelectMenu = new StringSelectMenuBuilder()
        .setCustomId("lessons_sub_select")
        .setPlaceholder("Request a sub for...")
        .addOptions(options)
      const actionRow1 =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          subSelectMenu,
        )
      const pageText = new TextDisplayBuilder().setContent(
        `-# Page ${currentPage + 1}`,
      )
      const prevPage = new ButtonBuilder()
        .setCustomId(`lessons_page_${currentPage - 1}_${userId}_${type}`)
        .setLabel("Last page")
        .setEmoji("◀️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0)
      const nextPage = new ButtonBuilder()
        .setCustomId(`lessons_page_${currentPage + 1}_${userId}_${type}`)
        .setLabel("Next page")
        .setEmoji("▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false)
      const actionRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        prevPage,
        nextPage,
      )
      const container = new ContainerBuilder()
        .addTextDisplayComponents(lessonsText)
        .addTextDisplayComponents(pageText)
        .addActionRowComponents(actionRow2)
      messages.push({
        flags: "IsComponentsV2",
        components: options.length > 0 ? [container, actionRow1] : [container],
        allowedMentions: { users: [] },
      })
      currentContent = ""
      currentLessons = []
      currentPage++
    }
  }

  for (const lesson of lessons) {
    const subRequests = db.getLessonOpenSubRequests(lesson.id)
    const hasSubRequest = subRequests.some(
      (r) => r.instructor_id === instructor.id,
    )
    const instructors = db.getLessonInstructors(lesson.id)
    const lessonContent = `**#${lesson.course_id} ${lesson.name}** - ${formatTimestamp(lesson.date)} (${formatLessonInstructorsCompact(instructors)}${hasSubRequest ? ", sub requested" : ""})`
    if (
      currentLessons.length >= 25 ||
      currentContent.length + lessonContent.length + 1 > 3500
    ) {
      pushCurrentMessage()
    }
    if (currentContent) {
      currentContent += "\n"
    }
    currentContent += lessonContent
    currentLessons.push(lesson)
  }
  pushCurrentMessage()

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!
    ;(message.components[0].components[1]! as TextDisplayBuilder).setContent(
      `-# Page ${i + 1} of ${messages.length}`,
    )
  }
  // no next page on last page hehe
  ;(
    messages[messages.length - 1]!.components[0]
      .components[2]! as ActionRowBuilder<ButtonBuilder>
  ).components[1]!.setDisabled(true)
  if (messages.length === 1) {
    messages[messages.length - 1]!.components[0].spliceComponents(2, 1)
  }

  return messages
}
