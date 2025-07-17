import {
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js"
import { createCommandGroup } from "../../utils/discordjs"
import { syncCalendar } from "../../services/calendar"

export const { command, execute, events } = createCommandGroup(
  (builder) =>
    builder
      .setName("calendar")
      .setDescription("[ADMIN] Manage the Google Calendar")
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  {
    sync: (sub) =>
      sub
        .setHandler(syncCommand)
        .setDescription("[ADMIN] Update the Google Calendar with the updates"),
  },
  {
    events: {
      ready: onReady,
    },
  },
)

async function syncCommand(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ flags: "Ephemeral" })
  await syncCalendar({
    callback: async (progress) => {
      await interaction.editReply(
        `<a:loading:1395368659328827402> Syncing Google Calendar... ${Math.round(progress * 100)}%`,
      )
    },
  })
  await interaction.editReply(":white_check_mark: Google Calendar has been updated.")
}

async function onReady() {
  await syncCalendar()
  console.log("Google Calendar has been synced on startup.")
  setInterval(
    async () => {
      try {
        console.log("Syncing Google Calendar...")
        await syncCalendar()
        console.log("Google Calendar has been synced.")
      } catch (error) {
        console.error("Failed to sync Google Calendar:", error)
      }
    },
    1000 * 60 * 5,
  ) // Sync every 5 minutes
}
