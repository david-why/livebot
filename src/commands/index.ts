import {
  ChatInputCommandInteraction,
  Collection,
  SharedSlashCommand,
  type ClientEvents,
} from "discord.js"

import * as ping from "./ping"
import * as config from "./config"
import * as course from "./course"

declare global {
  type ClientEventHandlers = {
    [K in keyof ClientEvents]: (...args: ClientEvents[K]) => Promise<unknown>
  }
}

const commands = new Collection<
  string,
  {
    command: SharedSlashCommand
    execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>
    events?: Partial<ClientEventHandlers>
  }
>()

commands.set("ping", ping)
commands.set("config", config)
commands.set("course", course)

export default commands
