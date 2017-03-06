const util = require('util'),
	events = require('events'),
	config = require('./lib/config'),
	logger = require('./lib/logger'),
	IRC = require('irc-framework'),
	https = require('https'),
	youtubeApiUrl = 'https://content.googleapis.com/youtube/v3/search?',
	youtubeVideoUrl = 'https://www.youtube.com/watch?v=';

config.configFile(process.argv[2], function (config) {
	var jack = new logger.Logger(config.log || {}),
		xbot = new IRC.Client(),
		channel = xbot.channel(config.irc.channel),
		joined = false,
		channelActiveStreams = {},
		checkYoutube = function(channelData) {
			if (!joined) return false;

			var channelId = channelData.id,
				nick = channelData.name;
			
			channelActiveStreams[channelId] = channelActiveStreams[channelId] || [];
			jack.log(`Sending Youtube Request for ${nick}. Active stream IDs: ${JSON.stringify(channelActiveStreams[channelId])}`);

			https.get(`${youtubeApiUrl}channelId=${channelId}&eventType=live&part=snippet&type=video&key=${config.youtube.apiKey}`, response => {
				jack.log(JSON.stringify(response.statusCode));
				jack.log(JSON.stringify(response.headers));

				// Collect the body in the most tedious way
				var body = '';
				response.on('data', function(chunk) {
					body += chunk;
				});

				// Do a thing
				response.on('end', function() {
					jack.log(body);
					var data = JSON.parse(body),
						announced = channelActiveStreams[channelId];

					if (data.pageInfo.totalResults) {
						data.items.forEach(i => {
							let id = i.id.videoId;
							if (!announced.includes(id)) {
								jack.log(`Added stream ${id}`);
								announced.push(id);
								channel.say(`${nick} is streaming @ ${youtubeVideoUrl}${id}`);
							}
						});
						// announced should be fully updated, so anything now there but not in data.items can be removed
						announced = announced.filter(id => {
							if (data.items.findIndex(element => element.id.videoId === id) < 0) {
								// Announce end and remove from array
								jack.log(`Removed stream ${id}`);
								channel.say(`${nick} has finished streaming @ ${youtubeVideoUrl}${id}`);
								return false;
							}
							// Keep in array
							return true;
						});
					} else {
						while (announced.length) {
							let id = announced.pop();
							jack.log(`Removed stream ${id}`);
							channel.say(`${nick} has finished streaming @ ${youtubeVideoUrl}${id}`);
						}
					}
				});
			});
		};

	xbot.connect({
		host: config.irc.network.host,
		port: config.irc.network.port,
		nick: config.irc.network.nick
	});

	xbot.on('registered', event => {
		channel.join();
		channel.say('hello');
		joined = true;
	});

	var timeoutID = setInterval(function () {
		// Keep irc alive
		xbot.ping();

		// Send youtube request for each channel
		config.youtube.channels.forEach(channel => {
			checkYoutube(channel);
		});
	}, config.youtube.checkIntervalMilliseconds);
});
