import type { ChatInputCommandInteraction } from "discord.js"
import { createCommand } from "../utils/discordjs"
import { db } from "../database"
import { formatTimestamp } from "../utils/format"

export const { command, execute, events } = createCommand((builder) =>
  builder
    .setHandler(handler)
    .setName("lessons")
    .setDescription("View your lessons"),
)

async function handler(interaction: ChatInputCommandInteraction) {
  const instructor = db.getInstructorByDiscordId(interaction.user.id)
  if (!instructor) {
    return interaction.reply({
      content: "You are not an instructor.",
      flags: "Ephemeral",
    })
  }

  const lessons = db.getInstructorLessons(instructor.id)
  if (lessons.length === 0) {
    return interaction.reply({
      content: "You have no lessons.",
      flags: "Ephemeral",
    })
  }

  const lessonList = lessons
    .map(
      (lesson) =>
        `**#${lesson.course_id} ${lesson.name}** - ${formatTimestamp(lesson.date)}`,
    )
    .join("\n")

  await interaction.reply({
    content: `Your lessons:\n${lessonList}`,
    flags: "Ephemeral",
  })
}
