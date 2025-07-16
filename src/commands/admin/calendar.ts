import type { ChatInputCommandInteraction } from "discord.js"
import { createCommandGroup } from "../../utils/discordjs"
import { syncCalendar } from "../../services/calendar"

export const { command, execute, events } = createCommandGroup(
  (builder) =>
    builder.setName("calendar").setDescription("Manage the Google Calendar"),
  {
    sync: (sub) =>
      sub
        .setHandler(syncCommand)
        .setDescription("Update the Google Calendar with the updates"),
  },
)

async function syncCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: "Ephemeral" })
  await syncCalendar()
  await interaction.editReply("Google Calendar has been updated.")
}
