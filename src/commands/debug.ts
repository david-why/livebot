import { ChatInputCommandInteraction, PermissionFlagsBits } from "discord.js"
import { createCommandGroup } from "../utils/discordjs"
import { updateSubRequestMessages } from "./sub"

export const { command, execute, events } = createCommandGroup(
  (builder) =>
    builder
      .setName("debug")
      .setDescription("Debug commands")
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  {
    "refresh-sub-requests": (sub) =>
      sub
        .setHandler(refreshSubRequestsCommand)
        .setDescription("Refresh sub requests"),
  },
)

async function refreshSubRequestsCommand(
  interaction: ChatInputCommandInteraction,
) {
  await interaction.deferReply({ ephemeral: true })
  await updateSubRequestMessages(interaction.client)
  await interaction.editReply("Sub requests refreshed successfully.")
}
