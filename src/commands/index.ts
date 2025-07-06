import {
  ChatInputCommandInteraction,
  Collection,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  SharedSlashCommand,
  type ClientEvents,
} from "discord.js"

declare global {
  type ClientEventHandlers = {
    [K in keyof ClientEvents]: (...args: ClientEvents[K]) => Promise<unknown>
  }
}

function register<T extends { command: { name: string } }>(
  commands: Collection<string, T>,
  command: T,
): void {
  commands.set(command.command.name, command)
}

import * as ping from "./ping"
import * as config from "./config"
import * as course from "./course"
import * as instructor from "./instructor"

const commands = new Collection<
  string,
  {
    command: SharedSlashCommand
    execute: (interaction: ChatInputCommandInteraction) => Promise<unknown>
    events?: Partial<ClientEventHandlers>
  }
>()

register(commands, ping)
register(commands, config)
register(commands, course)
register(commands, instructor)

export default commands

import * as addInstructor from "./context/add_instructor"

export const contextCommands = new Collection<
  string,
  {
    command: ContextMenuCommandBuilder
    execute: (interaction: ContextMenuCommandInteraction) => Promise<unknown>
    events?: Partial<ClientEventHandlers>
  }
>()

register(contextCommands, addInstructor)
