import {
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  type ChatInputCommandInteraction,
} from "discord.js"
import { createCommand, wrapEventHandler } from "../utils/discordjs"
import { db } from "../database"
import { formatTimestamp } from "../utils/format"
import type { Lesson } from "../models/lesson"
import { handleAddSubRequest } from "./sub"

export const { command, execute, events } = createCommand(
  (builder) =>
    builder
      .setHandler(handler)
      .setName("lessons")
      .setDescription("View your lessons"),
  {
    events: {
      interactionCreate: wrapEventHandler(handlePageChange, handleSubMenu),
    },
  },
)

async function handler(interaction: ChatInputCommandInteraction) {
  const instructor = db.getInstructorByDiscordId(interaction.user.id)
  if (!instructor) {
    return interaction.reply({
      content: "You are not an instructor.",
      flags: "Ephemeral",
    })
  }

  await interaction.deferReply({ flags: "Ephemeral" })

  const lessons = db.getInstructorLessons(instructor.id)

  const messages = await getUserLessonsMessages(lessons)
  if (messages.length === 0) {
    return interaction.reply({
      content: "You have no lessons.",
      flags: "Ephemeral",
    })
  }

  return interaction.followUp(messages[0]!)
}

async function handlePageChange(interaction: BaseInteraction) {
  if (!interaction.isButton()) return
  const match = interaction.customId.match(/^lessons_page_(\d+)$/)
  if (!match) return

  const page = parseInt(match[1]!, 10)

  await interaction.deferUpdate()

  const instructor = db.getInstructorByDiscordId(interaction.user.id)!
  const lessons = db.getInstructorLessons(instructor.id)

  const messages = await getUserLessonsMessages(lessons)
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

async function getUserLessonsMessages(lessons: Lesson[]) {
  if (lessons.length === 0) {
    return []
  }

  lessons.sort((a, b) => a.date.getTime() - b.date.getTime())

  const messages: {
    embeds: [EmbedBuilder]
    components: [
      ActionRowBuilder<StringSelectMenuBuilder>,
      ActionRowBuilder<ButtonBuilder>,
    ]
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
      const subSelectMenu = new StringSelectMenuBuilder()
        .setCustomId("lessons_sub_select")
        .setPlaceholder("Request a sub")
        .addOptions(options)
      const actionRow1 =
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
          subSelectMenu,
        )
      const prevPage = new ButtonBuilder()
        .setCustomId(`lessons_page_${currentPage - 1}`)
        .setLabel("Previous")
        .setEmoji("◀️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0)
      const nextPage = new ButtonBuilder()
        .setCustomId(`lessons_page_${currentPage + 1}`)
        .setLabel("Next")
        .setEmoji("▶️")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false)
      const actionRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
        prevPage,
        nextPage,
      )
      const embed = new EmbedBuilder()
        .setTitle("Your Lessons")
        .setDescription(currentContent)
      messages.push({
        embeds: [embed],
        components: [actionRow1, actionRow2],
      })
      currentContent = ""
      currentLessons = []
      currentPage++
    }
  }

  for (const lesson of lessons) {
    const lessonContent = `**#${lesson.course_id} ${lesson.name}** - ${formatTimestamp(lesson.date)} (${formatTimestamp(lesson.date, "R")})`
    if (
      currentLessons.length >= 25 ||
      currentContent.length + lessonContent.length + 1 > 4096
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

  messages[messages.length - 1]!.components[1]!.components[1]!.setDisabled(true)

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i]!
    message.embeds[0]!.setFooter({
      text: `Page ${i + 1} of ${messages.length}`,
    })
  }

  return messages
}
