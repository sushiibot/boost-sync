# Boost Sync Bot

Sync boost roles between different servers.

* Source server (native boost role) - user boosts this server!
* Follower server (custom boost role) - user gets a role in this server!

When a user boosts the source server, the user also gets a role in the follower
server, in addition to an announcement in the follower server.

## Commands

/boostsync follow [other_server_id] [announce_channel] [boost_role]
  * other_server_id:
    * Server ID to follow.
  * announce_channel:
    * Channel to send announcements for boosts on followed server.
  * role:
    * Role you want to give for boosting followed server.

/boostsync allow
  * other_server_id:
    * server ID to allow following this server.


https://discord.com/api/oauth2/authorize?client_id=992502410759127121&permissions=412585740480&scope=bot%20applications.commands
