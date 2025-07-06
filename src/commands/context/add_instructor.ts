import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  PermissionFlagsBits,
} from "discord.js"
import { db } from "../../database"

export const command = new ContextMenuCommandBuilder()
  .setName("Add Instructor")
  .setType(ApplicationCommandType.User)
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

export const execute = async (interaction: ContextMenuCommandInteraction) => {
  if (!interaction.isUserContextMenuCommand()) return
  const userId = interaction.targetId
  const name = interaction.targetUser.displayName
  db.addInstructor(userId, name)
  await interaction.reply({
    content: `Instructor ${name} (<@${userId}>) has been added.`,
    flags: "Ephemeral",
    allowedMentions: {
      users: [],
    },
  })
}
