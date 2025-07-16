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
  if (!interaction.isUserContextMenuCommand() || !interaction.inCachedGuild())
    return
  const userId = interaction.targetId
  const name =
    interaction.targetMember?.displayName ?? interaction.targetUser.displayName
  try {
    db.addInstructor(userId, name)
  } catch {
    return interaction.reply({
      content: `<@${userId}> is already an instructor.`,
      flags: "Ephemeral",
    })
  }
  await interaction.reply({
    content: `Instructor ${name} (<@${userId}>) has been added.`,
    allowedMentions: {
      users: [],
    },
  })
}
