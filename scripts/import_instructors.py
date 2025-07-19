import os
import sqlite3
from datetime import datetime
from sys import argv

import pandas as pd
import requests
from dotenv import load_dotenv

load_dotenv('.env.local')

DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
DEBUG_GUILD = os.getenv('DEBUG_GUILD')
assert DISCORD_TOKEN and DEBUG_GUILD

r = requests.get(
    f'https://discord.com/api/v10/guilds/{DEBUG_GUILD}/members?limit=1000',
    headers={'Authorization': f'Bot {DISCORD_TOKEN}'},
)
r.raise_for_status()
members = r.json()

db = sqlite3.connect('data.db')
cursor = db.cursor()

df = pd.read_excel(argv[1], sheet_name='TA Roster')
df = df.loc[df["Instructor #"].notna()]
df = df[["Instructor #", "First name", "Last name", "Email", "Status"]]

# why is there a datetime in Instructor #???
df["Instructor #"] = (
    df["Instructor #"]
    .apply(lambda x: x.day if isinstance(x, datetime) else x)
    .astype(int)
)

not_found_rows = []

for row in df.itertuples(index=False):
    cursor.execute('SELECT 1 FROM instructors WHERE id = ?', (row[0],))
    existing = cursor.fetchone()
    if existing:
        continue

    instructor_id = row[0]
    first_name = row[1].strip()
    last_name = row[2].strip()
    email = row[3].strip()

    if '(' in first_name:
        # take the stuff in parens
        first_name = first_name.split('(')[1].strip().split(')')[0].strip()

    full_name = f"{first_name} {last_name}"

    # find the discord user with this name
    discord_id = None
    for member in members:
        member_name = member.get('nick') or member.get('user', {}).get('username', '')
        if full_name.lower() in member_name.lower():
            discord_id = member['user']['id']
            break
    if not discord_id:
        print(f'User not found: {full_name} (instructor {instructor_id})')
        not_found_rows.append(row)
        continue

    cursor.execute(
        "INSERT OR REPLACE INTO instructors (id, discord_id, name, email) VALUES (?, ?, ?, ?)",
        (instructor_id, discord_id, full_name, email),
    )

db.commit()

for row in not_found_rows:
    cursor.execute('SELECT 1 FROM instructors WHERE id = ?', (row[0],))
    existing = cursor.fetchone()
    if existing:
        continue
    discord_id = input(f"{row[1]} {row[2]} ({row[4]}) ")
    if discord_id:
        if discord_id == '0':
            discord_id = ''
        cursor.execute(
            "INSERT OR REPLACE INTO instructors (id, discord_id, name, email) VALUES (?, ?, ?, ?)",
            (row[0], discord_id, f"{row[1].strip()} {row[2].strip()}", row[3].strip()),
        )
        db.commit()
