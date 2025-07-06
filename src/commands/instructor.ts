import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js"
import { db } from "../database"

export const command = new SlashCommandBuilder()
  .setName("instructor")
  .setDescription("Manage LIVE instructors")
  .addSubcommand((sub) =>
    sub.setName("list").setDescription("List all instructors"),
  )
  .addSubcommand((sub) =>
    sub
      .setName("info")
      .setDescription("Get information about a specific instructor")
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
      .setDescription("Edit an instructor's information")
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
  } else if (subcommand === "info") {
    const user = interaction.options.getUser("user", true)
    const instructor = db.getInstructor(user.id)
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
    const instructor = db.getInstructor(user.id)
    if (!instructor) {
      await interaction.reply({
        content: `User <@${user.id}> is not an instructor.`,
        flags: "Ephemeral",
      })
      return
    }
    if (name) instructor.name = name
    db.updateInstructor(instructor)
    await interaction.reply({
      content: `Instructor <@${instructor.discord_id}> has been updated.`,
      allowedMentions: { users: [] },
    })
  }
}
