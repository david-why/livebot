import {
  ChatInputCommandInteraction,
  Collection,
  SharedSlashCommand,
} from "discord.js"

import * as ping from "./ping"
import * as config from "./config"

const commands = new Collection<
  string,
  {
    command: SharedSlashCommand
    execute: (interaction: ChatInputCommandInteraction) => Promise<void>
  }
>()

commands.set("ping", ping)
commands.set("config", config)

export default commands
