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

export function formatTimestamp(date: Date, format: string = "F"): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:${format}>`
}

export function formatInstructorFlags(flags: number) {
  const flagsList: string[] = []
  if (flags & 1) flagsList.push("Sub")
  if (flags & 2) flagsList.push("Free-Will")
  return flagsList.length > 0 ? ` (${flagsList.join(", ")})` : ""
}
