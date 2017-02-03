// I apologize in advance for the unreadable code. :(

// --
// -- REVISION 3
// -- February 3rd, 2017 01:04 CST
// --

const Discord = require('discord.js');
const DiscordClient = new Discord.Client();
const fs = require('fs');

const settings = require('./settings.json');

var youtubedl = require('youtube-dl');
const streamOptions = { seek: 0, volume: 1 };
var URL = require('url-parse');

DiscordClient.on('ready', function() {
	console.log("Ready.");
	//console.log(DiscordClient.channels);
});

var streams_r = {};
var load = {};
var streams_w = {};
var vols = {};
var timestamps = {};
var channel_designations = {};
var queue = {};
var most_recent_text_channel = {};

function playTrack(channel, guildID, url_parts) {
	if(!channel) {
		channel = most_recent_text_channel[guildID];
	}

	var host = url_parts.hostname

	if(!(guildID in load)) {
		load[guildID] = 0;
	} else {
		if(load[guildID]) {
			load[guildID] = 0;
		} else {
			load[guildID] = 1;
		}
	}

	console.log("Playing " + url_parts.toString() + " in \"" + channel.guild.name + "\" (ID " + guildID + ")");

	var service = host.replace("www.", "");
	service = service.substr(0, service.indexOf("."));

	var curplaying = [service];
	if(url_parts.pathname) {
		curplaying.push(url_parts.pathname);
	}
	if("v" in url_parts.query) {
		curplaying.push(url_parts.query["v"]);
	}
	// FUCK PROMISES
	var msg_now;
	channel.sendMessage(":thinking: Downloading *" + curplaying.join("/") + "*...")
		.then(message => msg_now = message);

	var video = youtubedl(url_parts.toString(), ["--format=bestaudio"], {maxBuffer: 1000*512});

	if(guildID in streams_w) {
		if(streams_w[guildID][load[guildID]]) {
			streams_w[guildID][load[guildID]].end();	
		}
	} else {
		streams_w[guildID] = {};
	}
	streams_w[guildID][load[guildID]] = fs.createWriteStream('/tmp/' + guildID + "_" + load[guildID]);
	video.pipe(streams_w[guildID][load[guildID]]);

	video.on('info', function(info) {
		console.log(info.size);
		msg_now.edit(msg_now.content + "\n(" + info.size + " bytes)");
	});

	video.on('end', function() {
		var _c = channel.guild.voiceConnection
		if(_c) {
			if(_c.player) {
				_c.player.dispatcher.end();
			}
		}

		var room = "Music";
		if(guildID in channel_designations) {
			room = channel_designations[guildID]
		}

		channel.guild.channels.find("name", room).join()
			.then(connection => {
				if(guildID in streams_r) {
					var old_r = Math.abs(load[guildID] - 1);
					if(streams_r[guildID][old_r]) {
						streams_r[guildID][old_r].destroy();
					}
				} else {
					streams_r[guildID] = {};	
				}

				streams_r[guildID][load[guildID]] = fs.createReadStream('/tmp/' + guildID + "_" + load[guildID]);

				var vol = 1;
				if(guildID in vols) {
					vol = Math.min(Math.max(parseInt(vols[guildID]), 0), 100)/100;
				}

				const dispatcher = connection.playStream(streams_r[guildID][load[guildID]], {seek: 0, volume: vol});
				dispatcher.passes = 2;

				dispatcher.once('end', function(reason) {
					if(guildID in queue) {
						if(queue[guildID]["enabled"]) {
							if(queue[guildID]["list"].length > 0) {
								var row = queue[guildID]["list"][0];
								playTrack(null, row["guild"], row["url_parts"]);
								queue[guildID]["list"].splice(0, 1);
							}
						}
					}
				});

				msg_now.edit(":musical_note: Playing *" + curplaying.join("/") + "*");

				//console.log(DiscordClient.voiceConnections);
			})
			.catch(console.error);
	});	
}

DiscordClient.on('message', function(message) {
	if(message.channel.type == "dm") {
		return;
	}

	if(message.author.bot) {
		return;
	}

	if(message.isMentioned(DiscordClient.user)) {
		var params = message.content.split(" ")
		// console.log(params)

		if(params.length > 1) {
			if(params[1] == "play" && params.length > 2) {
				var url_parts = new URL(params[2], true);
				if(typeof url_parts.hostname != "undefined") {
					var host = url_parts.hostname
					if(!host) {
						message.reply("\"" + host + "\" is not a valid host.");
						return;
					}

					var _p = host.split(".");
					if(_p.length > 2) {
						_p.splice(0, _p.length-2);
						host = _p.join(".");
					}

					if(settings.youtubedl.allowed_hosts.indexOf(host.replace("www.", "")) == -1) {
						var parts = [
							"\"" + host + "\" is not in the list of allowed hosts.",
							"`" + settings.youtubedl.allowed_hosts.join(", ") + "`"
						];

						message.reply(parts.join("\n"));
						return;
					}

					if(message.guild.id in timestamps) {
						var last_played = timestamps[message.guild.id];
						if(Date.now() - last_played < settings.cooldown*1000) {
							message.reply(":no_good: Please wait another " + Math.floor((Date.now() - last_played)/1000) + " second(s)");
							return;
						}
					}
					timestamps[message.guild.id] = Date.now();

					most_recent_text_channel[message.guild.id] = message.channel;

					if(message.guild.id in queue) {
						if(queue[message.guild.id]["enabled"]) {
							//message.reply("Functionality is a work in progress. Please turn off queuing for now.");
							//return;

							queue[message.guild.id]["list"].push({
								"added_by": message.author.username + "#" + message.author.discriminator,
								"url_parts": url_parts,
								"guild": message.guild.id
							});

							message.reply(":pencil2: Added your song to the queue!");

							var _c = message.guild.voiceConnection
							if(_c) {
								console.log("connected...");
								if(!_c.speaking) {
									playTrack(message.channel, message.guild.id, url_parts);
									queue[message.guild.id]["list"].splice(0, 1);
								}
							} else {
								playTrack(message.channel, message.guild.id, url_parts);
								queue[message.guild.id]["list"].splice(0, 1);								
							}
						} else {
							playTrack(message.channel, message.guild.id, url_parts);
						}
					} else {
						playTrack(message.channel, message.guild.id, url_parts);
					}
				}
			}

			else if(params[1] == "stop") {
				var connection = message.guild.voiceConnection
				if(connection) {
					if(connection.player) {
						connection.player.dispatcher.end();
						message.reply(":octagonal_sign: **Stopped playback.**")
					}
				}
			}

			else if(params[1] == "toggle" || params[1] == "pause") {
				var connection = message.guild.voiceConnection
				if(connection) {
					if(connection.player) {
						var dispatcher = connection.player.dispatcher;
						if(dispatcher.paused) {
							connection.player.dispatcher.resume();
							message.reply(":point_right: **Resumed playback.**");
						} else {
							connection.player.dispatcher.pause();
							message.reply(":raised_hand: **Paused playback.**");
						}
					}
				}			
			}

			else if(params[1] == "vol" || params[1] == "volume") {
				if(params.length < 3) {
					return;
				}

				var connection = message.guild.voiceConnection;

				vols[message.guild.id] = Math.min(Math.max(parseInt(params[2]), 0), 100)

				if(connection) {
					if(connection.player) {
						connection.player.dispatcher.setVolume(vols[message.guild.id]/100)
					}
				}
				message.reply(":control_knobs: Set volume to **" + vols[message.guild.id].toString() + "%**");
			}

			else if(params[1] == "channel") {
				if(params.length < 3) {
					return;
				}

				if(!params[2]) {
					return;
				}

				var room = params.slice(2).join(" ");

				message.guild.fetchMember(message.author.id).then(member => {
					if(member.hasPermission("KICK_MEMBERS")) {
						channel = message.guild.channels.find("name", room);
						if(channel) {
							message.reply(":door: Moved to " + channel.name)
							channel_designations[message.guild.id] = channel.name;

							var connection = message.guild.voiceConnection;
							if(connection) {
								channel.join();
							}
						}
					} else {
						message.reply(":no_entry: You do not have the KICK_MEMBERS permission.");
					}
				});
			}

			else if(params[1] == "toggle_queue") {
				message.guild.fetchMember(message.author.id).then(member => {
					if(member.hasPermission("MANAGE_GUILD")) {
						if(!(message.guild.id in queue)) {
							queue[message.guild.id] = {
								"enabled": false,
								"list": []
							};
						}

						var state = queue[message.guild.id]["enabled"];
						if(!state) {
							state = true;
							message.reply(":notebook_with_decorative_cover: Queue functionality has been **enabled**. Songs will now be queued to play instead of playing immediately.");
						} else {
							state = false;
							message.reply(":muscle: Queue functionality has been **disabled**. Songs will now play immediately instead of from a list.");
						}
						queue[message.guild.id]["enabled"] = state;

					} else {
						message.reply(":no_entry: You do not have the MANAGE_GUILD permission.");
					}
				});				
			}
		}
	}
});

DiscordClient.login(settings.discord.token);