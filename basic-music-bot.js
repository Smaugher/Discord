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
var streams_w = {};
var vols = {};

DiscordClient.on('message', function(message) {
	if(message.channel.type == "dm") {
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

					var _c = message.guild.voiceConnection
					if(_c) {
						if(_c.player) {
							_c.player.dispatcher.end();
						}
					}

					console.log("Playing " + url_parts.toString());

					var service = host
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
					message.channel.sendMessage(":thinking: Downloading *" + curplaying.join("/") + "*...")
						.then(message => msg_now = message);

					var video = youtubedl(url_parts.toString(), ["--format=bestaudio"]);

					if(message.guild.id in streams_w) { streams_w[message.guild.id].end(); }
					streams_w[message.guild.id] = fs.createWriteStream('/tmp/' + message.guild.id);
					video.pipe(streams_w[message.guild.id]);

					video.on('info', function(info) {
						console.log(info.size);
						msg_now.edit(msg_now.content + "\n(" + info.size + " bytes)");
					});

					video.on('end', function() {
						message.guild.channels.find("name", "Music").join()
							.then(connection => {
								if(message.guild.id in streams_r) { streams_r[message.guild.id].destroy(); }
								streams_r[message.guild.id] = fs.createReadStream('/tmp/' + message.guild.id);

								var vol = 1;
								if(message.guild.id in vols) {
									vol = Math.min(Math.max(parseInt(vols[message.guild.id]), 0), 100)/100;
								}

								const dispatcher = connection.playStream(streams_r[message.guild.id], {seek: 0, volume: vol});
								dispatcher.passes = 2;

								msg_now.edit(":musical_note: Playing *" + curplaying.join("/") + "*");

								//console.log(DiscordClient.voiceConnections);
							})
							.catch(console.error);
					});
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
		}
	}
});

DiscordClient.login(settings.discord.token);