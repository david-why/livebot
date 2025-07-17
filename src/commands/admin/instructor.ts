import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js"
import { db } from "../../database"

export const command = new SlashCommandBuilder()
  .setName("instructor")
  .setDescription("[ADMIN] Manage LIVE instructors")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("[ADMIN] List all instructors"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add")
      .setDescription("[ADMIN] Add a new instructor")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The user to add as an instructor")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option
          .setName("email")
          .setDescription("The email of the instructor")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("[ADMIN] Get information about a specific instructor")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The instructor to get info about")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("edit")
      .setDescription("[ADMIN] Edit an instructor's information")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("The instructor to edit")
          .setRequired(true),
      )
      .addStringOption((option) =>
        option.setName("name").setDescription("The new name of the instructor"),
      ),
  )

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const subcommand = interaction.options.getSubcommand(true) as
    | "list"
    | "add"
    | "info"
    | "edit"

  if (subcommand === "list") {
    const instructors = db.getAllInstructors()
    if (instructors.length === 0) {
      await interaction.reply({
        content: "No instructors found.",
        flags: "Ephemeral",
      })
      return
    }
    const instructorList = instructors
      .map((i) => `- ${i.name} (<@${i.discord_id}>)`)
      .join("\n")
    await interaction.reply({
      content: `Instructors:\n${instructorList}`,
      allowedMentions: { users: [] },
    })
  } else if (subcommand === "add") {
    const user = interaction.options.getUser("user", true)
    const email = interaction.options.getString("email", true)
    const name = user.displayName
    db.addInstructor(user.id, name, email)
    await interaction.reply({
      content: `Instructor ${name} (<@${user.id}>) has been added.`,
      allowedMentions: { users: [] },
    })
  } else if (subcommand === "info") {
    const user = interaction.options.getUser("user", true)
    const instructor = db.getInstructorByDiscordId(user.id)
    if (!instructor) {
      await interaction.reply({
        content: `User <@${user.id}> is not an instructor.`,
        flags: "Ephemeral",
      })
      return
    }
    await interaction.reply({
      content: `Instructor Info:\nName: ${instructor.name}\nUser: <@${instructor.discord_id}>`,
      allowedMentions: { users: [] },
    })
  } else if (subcommand === "edit") {
    const user = interaction.options.getUser("user", true)
    const name = interaction.options.getString("name")
    const instructor = db.getInstructorByDiscordId(user.id)
    if (!instructor) {
      await interaction.reply({
        content: `User <@${user.id}> is not an instructor.`,
        flags: "Ephemeral",
      })
      return
    }
    await interaction.deferReply()
    if (name) instructor.name = name
    db.updateInstructor(instructor)
    if (name) {
      const lessons = db.getInstructorLessons(instructor.id)
      for (const lesson of lessons) {
        lesson.google_event_outdated = 1
        db.updateLesson(lesson)
      }
    }
    await interaction.editReply({
      content: `Instructor <@${instructor.discord_id}> has been updated.`,
      allowedMentions: { users: [] },
    })
  }
}
