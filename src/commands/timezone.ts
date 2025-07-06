import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js"
import { db } from "../database"

const allTimezones = Intl.supportedValuesOf("timeZone")

export const command = new SlashCommandBuilder()
  .setName("timezone")
  .setDescription("Set or get your timezone")
  .addStringOption((option) =>
    option
      .setName("timezone")
      .setDescription("Your timezone (e.g., 'America/New_York')")
      .setAutocomplete(true),
  )

export const execute = async (interaction: ChatInputCommandInteraction) => {
  const timezone = interaction.options.getString("timezone")
  if (!timezone) {
    const userTimezone = db.getUserTimezone(interaction.user.id)
    if (userTimezone) {
      return interaction.reply({
        content: `Your current timezone is \`${userTimezone}\`.`,
        flags: "Ephemeral",
      })
    }
    return interaction.reply({
      content: "You have not set a timezone yet.",
      flags: "Ephemeral",
    })
  }

  if (!allTimezones.includes(timezone)) {
    return interaction.reply({
      content: `Invalid timezone: \`${timezone}\`. Please provide a valid timezone.`,
      flags: "Ephemeral",
    })
  }

  db.setUserTimezone(interaction.user.id, timezone)
  await interaction.reply({
    content: `Your timezone has been set to \`${timezone}\`.`,
    flags: "Ephemeral",
  })
}

export const events = {
  interactionCreate: async (interaction) => {
    if (!interaction.isAutocomplete()) return
    if (interaction.commandName !== "timezone") return

    const focusedValue = interaction.options.getFocused(true).value
    console.log("autocomplete", focusedValue)
    const filtered = allTimezones.filter((timezone) =>
      timezone.toLowerCase().includes(focusedValue.toLowerCase()),
    )
    await interaction.respond(
      filtered
        .map((timezone) => ({ name: timezone, value: timezone }))
        .slice(0, 25),
    )
  },
} satisfies Partial<ClientEventHandlers>
