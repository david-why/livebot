import {
  ApplicationCommandOptionType,
  type CommandInteractionOption,
} from "discord.js"

export function formatOptions(options: readonly CommandInteractionOption[]) {
  return options
    .map((option) => {
      switch (option.type) {
        case ApplicationCommandOptionType.Subcommand:
        case ApplicationCommandOptionType.SubcommandGroup:
          return option.name
        case ApplicationCommandOptionType.String:
        case ApplicationCommandOptionType.Integer:
        case ApplicationCommandOptionType.Number:
        case ApplicationCommandOptionType.Boolean:
        case ApplicationCommandOptionType.User:
        case ApplicationCommandOptionType.Channel:
        case ApplicationCommandOptionType.Role:
        case ApplicationCommandOptionType.Mentionable:
          return `${option.name}: ${option.value}`
        case ApplicationCommandOptionType.Attachment:
          return `${option.name}: ${option.attachment?.name || "Attachment"}`
        default:
          return `${option.name}: ${option.value || "Unknown type"}`
      }
    })
    .join(", ")
}
