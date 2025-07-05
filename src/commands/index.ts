import {
  ChatInputCommandInteraction,
  Collection,
  SlashCommandBuilder,
} from "discord.js"

import * as ping from "./ping"

const commands = new Collection<
  string,
  {
    command: SlashCommandBuilder
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>
  }
>()

commands.set("ping", ping)

export default commands
