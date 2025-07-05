import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js"

export const command = new SlashCommandBuilder()
  .setName("ping")
  .setDescription("Replies with Pong!")
  .addStringOption((option) =>
    option.setName("input").setDescription("An optional input string"),
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const input = interaction.options.getString("input")
  await interaction.reply(input || "Pong!")
}
